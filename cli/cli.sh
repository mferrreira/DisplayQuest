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
# Repassa TODOS os argumentos ("$@") para o CLI dentro do container — necessário
# para o guard A10 aceitar em produção: ./cli.sh create-admin --allow-prod
if [ $# -eq 0 ]; then
    echo "📋 Iniciando modo interativo..."
    docker-compose exec app node cli/index.js
else
    echo "⚡ Executando comando: $*"
    docker-compose exec app node cli/index.js "$@"
fi
