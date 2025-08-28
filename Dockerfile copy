# Use Node.js version 18.16.0 as the base image
FROM node:18.16.0-alpine

# Set the working directory inside the container
WORKDIR /app

# Copy package.json and package-lock.json to install dependencies
COPY package*.json ./

# Install the Node.js dependencies
RUN npm install

# Copy the rest of the application code into the container
COPY . .

# Expose the port that the app will use (default to 8080, but it will be configurable via ENV variables)
EXPOSE 8081

# Start the application using npm
CMD ["npm", "run", "start"]

