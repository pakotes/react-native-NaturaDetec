#!/bin/sh
ollama serve &
sleep 2
ollama pull nomic-embed-text
wait