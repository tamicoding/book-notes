FROM node:18-bookworm-slim

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

ENV NODE_ENV=development
EXPOSE 3000

CMD ["sh", "-c", "npm run migrate:up && npm start"]
