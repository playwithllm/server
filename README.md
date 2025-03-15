## PlayWithLLM - Server

**Getting Started**

1. Clone this repository.
2. Copy `.env.example` to `.env.development` and configure environment variables. Then copy the `config.example.json` file to `config.development.json` and configure the settings.
3. Install dependencies with `npm install`.
4. Ensure infrastructure is up and running. We need MongoDB and RabbitMQ installed.
    * To spin up MongoDB and RabbitMQ locally, you can use Docker Compose file inside `/docker/docker-compose-infra.yml`.
    * To start MongoDB and RabbitMQ services, run (I assume you know how to run docker compose):
        ```bash
        docker-compose -f docker/docker-compose-infra.yml up -d
        ```
4. Start services:
   * Use `npm run start:business` for business logic service.
   * Use `npm run start:inference` for inference service.
   * OR, Use `npm run dev` to start both business and inference services concurrently.
   Terminal output:
   ```log
        03:27:56.533 info: [inference] Connected to RabbitMQ 
        03:27:56.537 info: [inference] Inference service messaging initialized 
        03:27:56.537 info: [inference] Inference service started successfully and listening for messages 
        03:27:56.659 info: [business] Starting web server... 
        03:27:56.660 info: [business] Express middlewares are set up 
        03:27:56.660 info: [business] Defining routes... 
        03:27:56.669 info: [business] Setting up routes for Inference 
        03:27:56.669 info: [business] Setting up routes for ApiKey 
        03:27:56.669 info: [business] Setting up routes for Models 
        03:27:56.670 info: [business] Routes defined 
        03:27:56.670 info: [business] Server is about to listen to port 4000 
        03:27:56.671 info: [business] Server is running on :::4000 
        03:27:56.672 info: [business] WebSocket server initialized 
        03:27:56.672 info: [business] Connecting to MongoDB... 
        03:27:56.678 info: [business] MongoDB connection is open 
    ```
5. Run migration:
    * Use `npm run migration` to setup the databse with the initial users.

6. Start client:
    * Visit `playwithllm/admin-ui` repository to setup and run the client.
**Testing**

Run `npm test` to execute all tests, or `npm run test:watch` for watch mode.

**Logging System**

The application uses a structured logging system with multiple log levels (error, warn, info, http, verbose, debug, silly). Logs are stored as JSON in the `logs` directory and can be configured through environment variables:

- `LOG_LEVEL`: Controls minimum level for file logs (default: 'info' in production, 'debug' in development)
- `CONSOLE_LOG_LEVEL`: Controls minimum level for console logs (default: 'warn' in production, 'debug' in development)

**Contributing**

Please refer to the [CONTRIBUTING.md](CONTRIBUTING.md) file for contribution guidelines and code style requirements.
