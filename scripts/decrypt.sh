#!/bin/bash
# Decrypt a file using AES-256-CBC with a key file
# Usage: decrypt.sh <key_file> <input_file> <output_file>
set -euo pipefail

if [ $# -ne 3 ]; then
  echo "Usage: $0 <key_file> <input_file> <output_file>" >&2
  exit 1
fi

openssl enc -aes-256-cbc -pbkdf2 -d -salt -in "$2" -out "$3" -pass "file:$1"
