# Node 18 LTS in a tiny image
FROM node:18-alpine

WORKDIR /usr/src/app

# Install deps first (faster rebuilds)
COPY package*.json ./
RUN npm ci --omit=dev

# Copy the rest
COPY . .

# Ensure production mode
ENV NODE_ENV=production

# Back4App/most hosts inject PORT; default to 3000 for local docker run
ENV PORT=3000
EXPOSE 3000

# Start server (your package.json has "start": "node src/app.js")
CMD ["npm", "start"]
