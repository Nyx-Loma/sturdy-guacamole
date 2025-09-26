FROM node:20-slim AS deps
WORKDIR /workspace
ENV PNPM_HOME=/usr/local/share/pnpm
ENV PATH="$PNPM_HOME:$PATH"
RUN npm install -g pnpm
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
RUN pnpm install --frozen-lockfile

FROM deps AS dev
WORKDIR /workspace
COPY . .
CMD ["pnpm", "--filter", "@arqivo/auth", "run", "start"]
