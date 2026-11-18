FROM node:24-alpine
RUN corepack enable
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile && pnpm build
ENV PORT=8787
EXPOSE 8787
CMD ["node", "--env-file-if-exists=.env", "services/api/dist/index.js"]
