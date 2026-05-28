import "dotenv/config"
import express from "express"
import cors from "cors"
import { ApolloServer } from "@apollo/server"
import { expressMiddleware } from "@apollo/server/express4"
import { typeDefs } from "./graphql/schema"
import { resolvers } from "./graphql/resolvers"
import "./bot/bot"

const app = express()

// APOLLO SERVER
const server = new ApolloServer({
  typeDefs,
  resolvers
})

// START SERVER
async function startServer() {
  await server.start()

  app.use(
    "/graphql",
    cors<cors.CorsRequest>(),
    express.json(),
    expressMiddleware(server)
  )

  app.listen(4000, () => {
    console.log("🚀 Server running on http://localhost:4000/graphql")
  })
}

startServer()
