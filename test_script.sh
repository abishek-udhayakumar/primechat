#!/bin/bash
rm -f cookies.txt
TOKEN=$(curl -s -c cookies.txt http://localhost/login | grep 'name="csrf-token"' | sed -E 's/.*content="([^"]+)".*/\1/')
RES=$(curl -s -b cookies.txt -c cookies.txt -X POST http://localhost/api/auth/login -H "Content-Type: application/json" -H "X-CSRF-Token: $TOKEN" -d '{"email": "abi@gmail.com", "password": "Password123!"}')
echo $RES
NEW_TOKEN=$(echo $RES | grep -o '"csrf_token":"[^"]*' | cut -d'"' -f4)
curl -s -b cookies.txt -c cookies.txt -X POST http://localhost/api/chat/send -H "Content-Type: application/json" -H "X-CSRF-Token: $NEW_TOKEN" -d '{"recipient_id": 3, "content": "hello", "type": "text", "client_msg_id": "test_dup_abc"}'
echo ""
curl -s -b cookies.txt -c cookies.txt -X POST http://localhost/api/chat/send -H "Content-Type: application/json" -H "X-CSRF-Token: $NEW_TOKEN" -d '{"recipient_id": 3, "content": "hello", "type": "text", "client_msg_id": "test_dup_abc"}'
