#!/bin/bash

# Check if NGROK_AUTHTOKEN is set
if [ -z "$NGROK_AUTHTOKEN" ]; then
  echo "NGROK_AUTHTOKEN is not set!"
  exit 1
fi

# Authenticate Ngrok
ngrok authtoken $NGROK_AUTHTOKEN


# Wait for the app to start

# Start the Node.js app
npm run start &
sleep 5
ngrok http --url=$NGROK_STATIC_URL $PORT

