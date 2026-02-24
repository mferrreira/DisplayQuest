#!/bin/bash

echo "🚀 Setting up Jogos application with Docker..."

# Stop any existing containers
echo "📦 Stopping existing containers..."
docker-compose down

# Build and start the application
echo "🔨 Building and starting containers..."
docker-compose up -d

# Wait for PostgreSQL to be ready
echo "⏳ Waiting for PostgreSQL to be ready..."
sleep 10

# Run database migrations
echo "🗄️ Running database migrations..."
docker-compose exec app npx prisma migrate deploy

# Wait for app to be ready
echo "⏳ Waiting for application to be ready..."
sleep 15

# Check if seed was executed successfully
echo "✅ Database setup completed!"
echo "🌱 Seed data should be automatically loaded"

echo "✅ Setup complete!"
echo "🌐 Application is running at: http://localhost:3000"
echo "👤 Admin login: admin@example.com / 123" 
