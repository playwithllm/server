const { MilvusClient } = require('@zilliz/milvus2-sdk-node');
const sharp = require('sharp');
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');

const logger = require('../log/logger');

const vllmClient = require('../../../services/inference/vllm/openai-vllm');

class MultimodalProcessor {
  constructor() {
    this.milvusClient = new MilvusClient({
      address: 'localhost:19530'
    });
    this.collectionName = 'multimodal_collection_pwllm';
    this.storageConfig = {
      baseImagePath: process.env.IMAGE_STORAGE_PATH || path.join(process.cwd(), 'uploads'),
      maxImageSize: 5 * 1024 * 1024, // 5MB
      allowedFormats: ['jpg', 'jpeg', 'png', 'webp']
    };

    this.clipModel = null;
    this.captionModel = null;
    this.pipeline = null;
    this.embeddingModel = null;
  }

  async init() {
    try {
      // Dynamically import transformers
      const { pipeline } = await import('@xenova/transformers');
      this.pipeline = pipeline;

      // Initialize models with smaller, public versions
      this.clipModel = await this.pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
      // this.captionModel = await this.pipeline('image-to-text', 'Xenova/vit-gpt2-image-captioning');

      // Initialize the embedding model
      this.embeddingModel = await this.pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');

      console.log('Models initialized successfully');
    } catch (error) {
      console.error('Error initializing models:', error);
      throw error;
    }
  }

  async storeImage(imageInput, filename) {
    try {
      const imageId = new Date().getTime() + '_' + Math.random().toString(36).substring(7);
      const storagePath = path.join(this.storageConfig.baseImagePath, imageId);

      // Ensure directory exists
      await fs.mkdir(this.storageConfig.baseImagePath, { recursive: true });

      // Process and optimize image
      const imageBuffer = await this.getImageBuffer(imageInput);
      await sharp(imageBuffer)
        .resize(800, 800, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 80 })
        .toFile(storagePath + '.webp');

      // Also save thumbnail for quick preview
      await sharp(imageBuffer)
        .resize(200, 200, { fit: 'cover' })
        .webp({ quality: 60 })
        .toFile(storagePath + '_thumb.webp');

      return {
        imageId,
        originalName: filename,
        mainPath: `${imageId}.webp`,
        thumbnailPath: `${imageId}_thumb.webp`
      };
    } catch (error) {
      console.error('Error storing image:', error);
      throw error;
    }
  }

  async generateCaption(imagePath) {
    if (!this.captionModel) {
      throw new Error('Models not initialized. Please call init() first.');
    }

    try {
      let localImagePath = imagePath;

      if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
        localImagePath = await this.downloadImage(imagePath);
      }

      const output = await this.captionModel(localImagePath);

      if (localImagePath !== imagePath) {
        await fs.rm(path.dirname(localImagePath), { recursive: true });
      }

      return output[0].text;
    } catch (error) {
      console.error('Error generating caption:', error);
      throw error;
    }
  }

  async expandTextWithVLLM(text) {
    console.log('expandTextWithVLLM(): text:', text);
    try {
      const prompt = `Given the text: "${text}"
Generate 3-5 closely related terms or phrases that capture similar semantic meaning.
Only output the terms separated by commas, nothing else.
For example:
Input: "dog"
Output: puppy, canine, pet dog, domestic dog`;
      console.log('expandTextWithVLLM(): prompt:', prompt);
      const vllmResponse = await vllmClient.generateCompletion(prompt);
      const vllmResponseText = vllmResponse.choices[0].message.content;
      const combinedText = `${text} ${vllmResponseText}`.trim();
      logger.info(`Expanded "${text}" to: ${combinedText}`);
      return combinedText;
    } catch (error) {
      logger.warn('Text expansion failed, using original text:', error);
      return text;
    }
  }

  async getEmbedding(text, useExpansion = true) {
    try {
      if (!this.embeddingModel) {
        throw new Error('Embedding model not initialized. Please call init() first.');
      }

      if (typeof text !== 'string') {
        throw new Error('Input must be a string');
      }

      const cleanText = text.trim();
      if (!cleanText) {
        throw new Error('Input text cannot be empty');
      }

      // Only expand text if flag is true and text isn't too long
      const textToEmbed = useExpansion && cleanText.length < 100
        ? await this.expandTextWithVLLM(cleanText)
        : cleanText;

      const output = await this.embeddingModel(textToEmbed, {
        pooling: 'mean',
        normalize: true
      });

      return Array.from(output.data);
    } catch (error) {
      logger.error('Error getting text embedding:', error);
      throw error;
    }
  }

  async initializeCollection() {
    try {
      // First check if collection exists
      const collections = await this.milvusClient.listCollections();
      console.log('Existing collections:', collections);

      const collectionExists = collections.collection_names.includes(this.collectionName);

      if (collectionExists) {
        console.log(`Collection ${this.collectionName} exists, loading...`);
        await this.milvusClient.loadCollection({
          collection_name: this.collectionName
        });

        // Get and log current collection statistics
        const stats = await this.getCollectionStats();
        console.log('Collection loaded with stats:', stats);
        return true;
      }

      // Only create new collection if it doesn't exist
      console.log(`Creating new collection: ${this.collectionName}`);
      const dimensionSize = 384; // MiniLM-L6-v2 embedding dimension

      await this.milvusClient.createCollection({
        collection_name: this.collectionName,
        fields: [
          {
            name: 'id',
            description: 'ID field',
            data_type: 'Int64',
            is_primary_key: true,
            auto_id: true
          },
          {
            name: 'product_name_vector',
            description: 'Product name embedding vector',
            data_type: 'FloatVector',
            dim: dimensionSize
          },
          {
            name: 'metadata',
            description: 'Metadata field',
            data_type: 'JSON'
          }
        ]
      });

      console.log('Creating index...');
      await this.milvusClient.createIndex({
        collection_name: this.collectionName,
        field_name: 'product_name_vector',
        index_type: 'IVF_FLAT',
        metric_type: 'COSINE',
        params: { nlist: 1024 }
      });

      await this.milvusClient.loadCollection({
        collection_name: this.collectionName
      });

      console.log('Collection initialized successfully');
      return true;
    } catch (error) {
      console.error('Error initializing collection:', error);
      throw error;
    }
  }

  async storeProductEmbedding(productId, product) {
    try {
      // Get expanded text for the product name
      const expandedText = await this.expandTextWithVLLM(product.name);

      // Combine name and expanded text for embedding
      const textToEmbed = `${product.name} ${expandedText}`.trim();
      const embedding = await this.getEmbedding(textToEmbed, false);

      const insertData = {
        collection_name: this.collectionName,
        fields_data: [{
          id: parseInt(Date.now().toString() + Math.floor(Math.random() * 1000)),
          product_name_vector: embedding,
          metadata: {
            productId,
            name: product.name,
            created_at: new Date().toISOString()
          }
        }]
      };

      await this.milvusClient.insert(insertData);
      await this.milvusClient.flush({
        collection_names: [this.collectionName]
      });

      // Return expanded text so it can be saved in MongoDB
      return { embedding, expandedText };
    } catch (error) {
      logger.error(`Error storing product embedding for ${productId}:`, error);
      throw error;
    }
  }

  async processAndStore(imageInput, originalText = '', filename = '') {
    try {
      // Store the image first
      const imageInfo = await this.storeImage(imageInput, filename);

      // Generate caption
      const generatedCaption = await this.generateCaption(imageInput);

      // Get embeddings
      const [imageEmbedding, captionEmbedding, textEmbedding] = await Promise.all([
        this.getEmbedding(imageInput, 'image'),
        this.getEmbedding(generatedCaption),
        originalText ? this.getEmbedding(originalText) : this.getEmbedding(generatedCaption)
      ]);

      // Store in Milvus with enhanced metadata
      await this.milvusClient.insert({
        collection_name: this.collectionName,
        fields_data: [{
          image_vector: imageEmbedding,
          caption_vector: captionEmbedding,
          text_vector: textEmbedding,
          metadata: {
            imageId: imageInfo.imageId,
            originalName: imageInfo.originalName,
            mainPath: imageInfo.mainPath,
            thumbnailPath: imageInfo.thumbnailPath,
            generated_caption: generatedCaption,
            original_text: originalText || generatedCaption,
            created_at: new Date().toISOString(),
            file_size: Buffer.byteLength(await this.getImageBuffer(imageInput))
          }
        }]
      });

      return {
        imageInfo,
        caption: generatedCaption,
        metadata: {
          original_text: originalText
        }
      };
    } catch (error) {
      console.error('Error processing and storing:', error);
      throw error;
    }
  }

  async search(query, queryType = 'text', searchFields = ['image_vector', 'caption_vector', 'text_vector'], limit = 5) {
    try {
      const queryVector = await this.getEmbedding(query, queryType);

      // Search across all specified vector fields
      const searchPromises = searchFields.map(field =>
        this.milvusClient.search({
          collection_name: this.collectionName,
          vector: queryVector,
          field_name: field,
          limit: limit,
          params: { nprobe: 10 }
        })
      );

      const results = await Promise.all(searchPromises);

      // Combine and deduplicate results
      const combinedResults = results.flat().sort((a, b) => b.score - a.score);
      const uniqueResults = Array.from(new Map(
        combinedResults.map(item => [item.metadata.image_path, item])
      ).values());

      return uniqueResults.slice(0, limit);
    } catch (error) {
      console.error('Error searching:', error);
      throw error;
    }
  }

  async searchProductEmbedding(searchText, limit = 5) {
    try {
      console.log('searchProductEmbedding(): searchText:', searchText);
      // For search queries, we want to be more aggressive with expansion
      const expandedQuery = await this.expandTextWithVLLM(searchText);
      console.log('searchProductEmbedding(): expandedQuery:', expandedQuery);
      const queryVector = await this.getEmbedding(expandedQuery, false); // false because text is already expanded
      const searchResults = await this.milvusClient.search({
        collection_name: this.collectionName,
        vector: queryVector,
        field_name: 'product_name_vector',
        limit: limit * 2, // Get more results initially for better filtering
        params: { nprobe: 16 }, // Increased from 10 for better recall
        output_fields: ['metadata']
      });

      // Process and rank results considering semantic similarity
      const processedData = searchResults.results
        .map(result => ({
          productId: result.metadata.productId,
          name: result.metadata.name,
          score: result.score,
          created_at: result.metadata.created_at
        }))
        // Optional: Additional relevance scoring logic here
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);

      logger.debug('Search results for:', searchText, processedData);
      return processedData;
    } catch (error) {
      logger.error('Error searching product embedding:', error);
      throw error;
    }
  }

  async getCollectionStats() {
    try {
      // Get collection statistics
      const stats = await this.milvusClient.getCollectionStatistics({
        collection_name: this.collectionName
      });

      console.log('Collection Stats:', {
        rowCount: stats.row_count,
        collectionName: this.collectionName
      });

      return stats;
    } catch (error) {
      console.error('Error getting collection stats:', error);
      throw error;
    }
  }

  async listAllProducts(limit = 100) {
    try {
      const results = await this.milvusClient.query({
        collection_name: this.collectionName,
        filter: "", // empty string means no filter
        output_fields: ["metadata"],
        limit
      });

      console.log('Products in Milvus:', results);
      return results;
    } catch (error) {
      console.error('Error listing products:', error);
      throw error;
    }
  }

  async testConnection() {
    try {
      const version = await this.milvusClient.getVersion();
      console.log('Connected to Milvus version:', version);
      return true;
    } catch (error) {
      console.error('Failed to connect to Milvus:', error);
      throw error;
    }
  }

  async searchByMetadata(metadata) {
    try {
      const expr = `json_contains(metadata, '${JSON.stringify(metadata)}')`;
      const results = await this.milvusClient.query({
        collection_name: this.collectionName,
        filter: expr,
        output_fields: ['metadata'],
        limit: 1
      });

      console.log(`searchByMetadata results for ${JSON.stringify(metadata)}:`, results);
      return results;
    } catch (error) {
      logger.error('Error searching by metadata:', error);
      throw error;
    }
  }

  async deleteCollection() {
    try {
      const exists = await this.milvusClient.hasCollection({
        collection_name: this.collectionName
      });

      if (exists) {
        await this.milvusClient.dropCollection({
          collection_name: this.collectionName
        });
        console.log(`Collection ${this.collectionName} deleted successfully`);
      } else {
        console.log(`Collection ${this.collectionName} does not exist`);
      }
    } catch (error) {
      logger.error('Error deleting collection:', error);
      throw error;
    }
  }

  async semanticSearch(userQuery, contextSize = 5) {
    try {
      // First, understand the intent of the query using VLLM
      const searchQuery = await vllmClient.generateCompletion(`
Convert this user question into a search-optimized query. 
Keep only the essential search terms.
User question: "${userQuery}"`);

      const queryResponseText = searchQuery.choices[0].message.content;

      // Get expanded results
      const results = await this.searchProductEmbedding(queryResponseText, contextSize);

      console.log('semanticSearch(): results:', results);

      // Format results for chatbot context
      const context = results.map(r => ({
        content: r.name,
        score: r.score,
        metadata: r.metadata
      }));

      return {
        originalQuery: userQuery,
        searchQuery,
        results: context
      };
    } catch (error) {
      logger.error('Error in semantic search:', error);
      throw error;
    }
  }

  async ragSearch(Product, query, limit = 5) {
    try {
      // Get semantic meaning of the query
//       const semanticQuery = await vllmClient.generateCompletion(`
// Convert this user question into a search-optimized query. 
// Keep only the essential search terms.
// User question: "${query}"`);

//       const semanticQueryText = semanticQuery.choices[0].message.content;

      // Search in Milvus
      const searchResults = await this.searchProductEmbedding(query, limit);

      console.log('ragSearch(): searchResults:', searchResults);

      // Get product IDs from results
      const productIds = searchResults.map(result => result.productId);

      // Fetch full product details from MongoDB
      const products = await Product.find({ sourceId: { $in: productIds } });

      // Prepare context for LLM
      const context = products.map(p => `
Product ID: ${p.sourceId}
Name: ${p.name}
Description: ${p.aboutProduct}
Price: ${p.price}
Category: ${p.category}
`).join('\n---\n');

      // Generate LLM prompt
      const prompt = `User Query: "${query}"

Available Products:
${context}

Based on the user's query, analyze these products and return ONLY the product IDs that best match the query.
Format your response as a comma-separated list of product IDs, nothing else.
Example response format: "123, 456, 789"`;

      // Get LLM response
      const llmResponse = await vllmClient.generateCompletion(prompt);

      console.log('ragSearch(): LLM response:', llmResponse.choices[0].message);

      // Extract product IDs from LLM response
      const recommendedIds = llmResponse.choices[0].message.content
        .split(',')
        .map(id => id.trim())
        .filter(Boolean);

      // Fetch final products in order of recommendation
      const finalProducts = await Product.find({
        sourceId: { $in: recommendedIds }
      });

      // Sort products according to LLM's recommendation order
      const sortedProducts = recommendedIds
        .map(id => finalProducts.find(p => p.sourceId === id))
        .filter(Boolean);

      return sortedProducts;
    } catch (error) {
      logger.error('Error in RAG search:', error);
      throw error;
    }
  }
}

module.exports = MultimodalProcessor;

