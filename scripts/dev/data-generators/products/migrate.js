const mongoose = require('mongoose');
const Product = require('../../../../src/services/business/domains/product/schema');
const { create, getBySourceId } = require('../../../../src/services/business/domains/product/service');
const { parseProductsCSV } = require('./parse-products');
const MultimodalProcessor = require('../../../../src/shared/libraries/embedding/MultimodalProcessor');

const resetDatabase = async (multimodalProcessor) => {
  console.log('Resetting database...');
  await Product.deleteMany({});
  await multimodalProcessor.deleteCollection();

  // Final verification after reset
  const stats = await multimodalProcessor.getCollectionStats();
  console.log('Final stats:', stats);

  // List all products after reset
  const savedProducts = await multimodalProcessor.listAllProducts();
  console.log('Current products:', savedProducts);
}

async function processProductImage(multimodalProcessor, product) {
  try {
    if (!product.images || !product.images[0]) {
      return { imageAnalysis: null, imageEmbedding: null };
    }

    const imagePath = product.images[0].startsWith('http')
      ? await multimodalProcessor.downloadImage(product.id, product.images[0])
      : path.join(multimodalProcessor.storageConfig.baseImagePath, product.images[0]);

    // Generate both caption and detailed analysis
    const [basicCaption, imageEmbedding] = await Promise.all([
      multimodalProcessor.generateCaption(product.id, imagePath, product.name),
      // multimodalProcessor.generateDetailedImageAnalysis(imagePath, product.name),
      multimodalProcessor.getImageEmbedding(imagePath)
    ]);

    // console.log('basicCaption:', basicCaption);

    // Combine basic caption with detailed analysis
    // const imageAnalysis = {
    //   basicCaption,
    //   // detailedAnalysis,
    //   imagePath
    // };

    return { basicCaption, imageEmbedding };
  } catch (error) {
    console.error(`Error processing image for product ${product.id}:`, error);
    return { basicCaption: null, imageEmbedding: null };
  }
}

async function populateProducts(multimodalProcessor) {
  try {
    console.log('Populating products...');

    const products = await parseProductsCSV('./products.csv');
    console.log(`Found ${products.length} products to process`);

    const start = 11;
    const end = 20;
    const customItemArray = products.slice(start, end);

    let index = start;
    for (const product of customItemArray) {
      try {
        console.log(`Processing product ${index++} of ${end}`);
        // Check both MongoDB and vector database
        const existingProduct = await getBySourceId(product.id);
        const existingVector = await multimodalProcessor.searchByMetadata({ productId: product.id });

        if (existingProduct && existingVector.length > 0) {
          console.log(`Product with sourceId ${product.id} already exists in both databases`);
          continue;
        }

        console.log(`Processing product: ${product.id} - ${product.name}`);

        // Process image and get analysis
        const { basicCaption, imageEmbedding } = await processProductImage(multimodalProcessor, product);

        // Get expanded text description
        const expandedText = await multimodalProcessor.expandTextWithVLLM(product.name);

        console.log('imageAnalysis:', { basicCaption, expandedText });

        // Create or update MongoDB document
        if (!existingProduct) {
          const mongoProduct = {
            ...product,
            expandedText,
            caption: `${basicCaption} ${expandedText}`
          };
          const result = await create(mongoProduct);
          console.log(`Created MongoDB document with ID: ${result._id}`);
        }

        // Store vector embedding if it doesn't exist
        if (!existingVector.length && imageEmbedding) {
          // Combine product name, expanded text, and image analysis for text embedding
          const textToEmbed = [
            product.name,
            expandedText,
            product.category,
            basicCaption,
          ].filter(Boolean).join(' ');

          console.log('textToEmbed:', textToEmbed);

          const textEmbedding = await multimodalProcessor.getEmbedding(textToEmbed, false);

          // Insert into Milvus with enhanced metadata
          const insertData = {
            collection_name: multimodalProcessor.collectionName,
            fields_data: [{
              id: parseInt(Date.now().toString() + Math.floor(Math.random() * 1000)),
              product_name_vector: textEmbedding,
              image_vector: imageEmbedding,
              metadata: {
                productId: product.id,
                created_at: new Date().toISOString()
              }
            }]
          };

          const { IDs } = await multimodalProcessor.milvusClient.insert(insertData);
          await multimodalProcessor.milvusClient.flush({
            collection_names: [multimodalProcessor.collectionName]
          });

          console.log(`Stored vector embedding for product: ${product.id}, IDs:`, IDs);
        }

        // Add a small delay between operations
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Verify after each insert
        const stats = await multimodalProcessor.getCollectionStats();
        console.log('Current collection stats:', stats);

      } catch (error) {
        console.error(`Error processing product ${product.id}:`, error);
        // Continue with next product
      }
    }

    console.log('Products populated');

    // Final verification
    const stats = await multimodalProcessor.getCollectionStats();
    console.log('Final stats:', stats);

    const savedProducts = await multimodalProcessor.listAllProducts();
    console.log('Saved products:', savedProducts);

  } catch (error) {
    console.error('Error in populateProducts:', error);
    throw error;
  }
}

const run = async () => {
  await mongoose.connect('mongodb://localhost:27017/pwllmdb');
  console.log('Connected to MongoDB');
  const multimodalProcessor = new MultimodalProcessor();
  await multimodalProcessor.init();
  await multimodalProcessor.initializeCollection();
  await multimodalProcessor.testConnection();
  await populateProducts(multimodalProcessor);
  await mongoose.connection.close();
}

const cleanup = async () => {
  await mongoose.connect('mongodb://localhost:27017/pwllmdb');
  console.log('Connected to MongoDB');
  const multimodalProcessor = new MultimodalProcessor();
  await multimodalProcessor.init();
  await multimodalProcessor.initializeCollection();
  await multimodalProcessor.testConnection();
  await resetDatabase(multimodalProcessor);
  await mongoose.connection.close();
}

module.exports = { run, cleanup };
