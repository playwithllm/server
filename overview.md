## **PlayWithLLM Server: Architecture Overview**

**Purpose**

This repository contains the server-side components of PlayWithLLM, a platform for working with large language models. The architecture follows domain-driven design principles and is built as a multi-service application focused on scalability and maintainability.

NOTE: I will be separating the `Inference service` and `Business service` into two separate repositories in the future.

**Key Principles**

* **Domain-Driven Design:** Organized around business domains with clear separation of concerns.
* **Microservices Architecture:** Multiple specialized services (business, inference) working together.
* **API-First Design:** Well-structured RESTful APIs with proper validation and error handling.
* **Comprehensive Logging:** Structured logging system for monitoring and debugging.

**TODO**: * **Containerization:** Docker-based deployment for consistent environments.

**Project Structure Overview**

* **root directory**
    * **docker/** - Docker configurations for containerizing the application services.
    * **docs/** - Project documentation and sample data.
    * **scripts/** - Development, deployment, and utility scripts.
    * **src/** - Source code organized by service and domain.
      * `services/` - Service-specific implementations:
        * `business/` - Core business logic service.
        * `inference/` - LLM inference and processing service.
      * `shared/` - Common utilities and libraries:
        * `configs/` - Configuration management.
        * `libraries/` - Shared functionality like db setup, email, logging, email, etc.
        * `middlewares/` - Express middlewares like auth, error handling, rate limiting, etc.
        * `migrations/` - Database migrations when we need to run some database commands when the application starts or updates.
    * **test/** - Unit and integration tests.

**Service Architecture**

The system consists of three main services:

1. **Business Service (Port 4000):** Manages core business logic and data operations including authentication, user management, etc.
2. **Inference Service (Queue listener):** Interfaces with LLM models and manages inference operations.

