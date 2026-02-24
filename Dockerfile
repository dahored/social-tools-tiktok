FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY . .
RUN mkdir -p /app/data

EXPOSE 4050
ENV PORT=4050

CMD ["npm", "start"]
