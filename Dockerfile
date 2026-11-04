FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY . .
RUN mkdir -p /app/data

EXPOSE 40005
ENV PORT=40005

CMD ["npm", "start"]
