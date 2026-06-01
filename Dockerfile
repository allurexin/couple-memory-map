FROM node:24-alpine

WORKDIR /app

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=5173
ENV DATA_DIR=/data

COPY package.json ./
COPY app ./app
COPY config.example.json ./

RUN mkdir -p /data

EXPOSE 5173
VOLUME ["/data"]

CMD ["npm", "start"]
