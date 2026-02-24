#!/bin/bash

# CLI Wrapper para o DisplayQuest
# Uso: ./cli.sh [comando] ou ./cli.sh (modo interativo)

echo "🚀 CLI do DisplayQuest"
echo "======================"

# Verificar se Docker está rodando
if ! docker-compose ps | grep -q "display-quest.*Up"; then
    echo "❌ Sistema não está rodando. Execute: docker-compose up -d"
    exit 1
fi

# Executar CLI no container
if [ $# -eq 0 ]; then
    echo "📋 Iniciando modo interativo..."
    docker-compose exec app node cli/index.js
else
    echo "⚡ Executando comando: $1"
    docker-compose exec app node cli/index.js "$1"
fi
