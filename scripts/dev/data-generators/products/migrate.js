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

async function populateProducts(multimodalProcessor) {
  try {
    console.log('Populating products...');

    const products = await parseProductsCSV('./products-light.csv');
    console.log(`Found ${products.length} products to process`);

    // const oneItemArray = [products[0]];

    for (const product of products) {
      try {
        // Check both MongoDB and vector database
        const existingProduct = await getBySourceId(product.id);
        const existingVector = await multimodalProcessor.searchByMetadata({ productId: product.id });

        if (existingProduct && existingVector.length > 0) {
          console.log(`Product with sourceId ${product.id} already exists in both databases`);
          continue;
        }

        console.log(`Processing product: ${product.id} - ${product.name}`);

        // Create product in MongoDB if it doesn't exist
        if (!existingProduct) {
          const result = await create(product);
          console.log(`Created MongoDB document with ID: ${result._id}`);
        }

        // Store embedding in Milvus only if vector doesn't exist
        if (!existingVector.length) {
          const { expandedText, caption, IDs } = await multimodalProcessor.storeProductEmbedding(
            product.id,
            product
          );

          console.log('insertResult:', IDs);

          // Update MongoDB document with expanded text
          await Product.findOneAndUpdate(
            { sourceId: product.id },
            { expandedText, caption },
            { new: true }
          );

          console.log(`Stored vector embedding and expanded text for product: ${product.id}`);
          await new Promise(resolve => setTimeout(resolve, 1000));
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
