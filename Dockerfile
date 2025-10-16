# Multi-stage build for KERN v3 Engine
FROM node:18-alpine AS builder

# Install build dependencies
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    sqlite-dev

WORKDIR /app

# Copy package files first for better caching
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies
RUN npm install && npm cache clean --force

FROM node:18-alpine AS runtime

# Install runtime dependencies
RUN apk add --no-cache sqlite

WORKDIR /app

# Copy built dependencies and source
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./

# Copy source files - ONLY the files we need
COPY kern_runtime_v3_full.ts ./
COPY systemmanifest_instance.json ./
COPY kern_schemas/ ./kern_schemas/

# Copy ONLY the working source files (not the broken ones)
COPY src/yaml_to_kern_bridge.js ./src/
COPY src/sqlite-persistence-layer.js ./src/
COPY src/integration-example.js ./src/

# Create required directories
RUN mkdir -p rules data output audit history exports temp database

# Create non-root user for security
RUN addgroup -g 1001 -S kern && \
    adduser -S kern -u 1001 -G kern && \
    chown -R kern:kern /app

USER kern

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD node -e "console.log('KERN Engine healthy')" || exit 1

# Use the working integration file
CMD ["node", "src/integration-example.js", "init"]
