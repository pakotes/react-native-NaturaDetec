FROM node:24-alpine

WORKDIR /app
COPY package.json package-lock.json ./
COPY ./db/ ./db/ 
RUN npm config set fund false && \
    npm config set audit false && \
    npm ci --only=production --prefer-offline

RUN npm install dotenv --save
RUN npm install bcrypt --save
RUN npm install jsonwebtoken --save
RUN npm install node-fetch@2 --save
RUN npm install multer --save
RUN npm install sharp --save

COPY . .
EXPOSE 3000
CMD ["npm", "start"]