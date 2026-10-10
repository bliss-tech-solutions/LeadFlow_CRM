FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
# The repository does not ship a lockfile yet, so use npm install rather than npm ci.
RUN npm install --no-audit --no-fund
COPY tsconfig.json ./
COPY src ./src
COPY scripts ./scripts
RUN npm run build && npm prune --omit=dev
ENV NODE_ENV=production
EXPOSE 4000
CMD ["npm", "start"]
