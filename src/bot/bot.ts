import PDFDocument from "pdfkit"
import fs from "fs"
import path from "path"
import TelegramBot from "node-telegram-bot-api"
import axios from "axios"

console.log("🚀 Bot file loaded")

const token = process.env.BOT_TOKEN

if (!token) {
  throw new Error("BOT_TOKEN missing")
}

const bot = new TelegramBot(token, { polling: true })

console.log("✅ Bot started polling")

const GRAPHQL_URL = "http://localhost:4000/graphql"

// START COMMAND
bot.onText(/\/start/, (msg) => {
  bot.sendMessage(
    msg.chat.id,
    `🚀 Welcome to Billing Bot\n\nCommands:\n/addproduct <name> <price> <quantity>\n/stock\n/bill <name> <quantity>`
  )
})

// ADD PRODUCT COMMAND
bot.onText(/\/addproduct/, async (msg) => {

  const chatId = msg.chat.id

  const parts =
    msg.text?.trim().split(/\s+/)

  const name = parts?.[1]

  const price =
    Number(parts?.[2])

  const quantity =
    Number(parts?.[3])

  const categoryName =
    parts?.[4]

  try {

    const response =
      await axios.post(

        "http://localhost:4000/graphql",

        {

          query: `

            mutation {

              addProduct(

                name: "${name}"

                price: ${price}

                quantity: ${quantity}

                ${categoryName ? `categoryName: "${categoryName}"` : ""}

              ) {

                id
                name
                price
                quantity
              }
            }
          `
        }
      )

    const product =
      response.data.data.addProduct

    if (!product) {
      const errMsg = response.data.errors?.[0]?.message || "Unknown error"
      return bot.sendMessage(chatId, `❌ Failed: ${errMsg}`)
    }

    bot.sendMessage(

      chatId,

      `
✅ Product Added

Name: ${product.name}

Price: ₹${product.price}

Quantity: ${product.quantity}
`
    )

  } catch (error) {

    console.log(error)

    bot.sendMessage(

      chatId,

      "❌ Failed to add product"
    )
  }
})
// STOCK COMMAND
bot.onText(/\/stock/, async (msg) => {

  const chatId = msg.chat.id

  const parts =
    msg.text?.trim().split(/\s+/)

  const categoryName =
    parts?.[1]

  try {

    let query = ""

    // CATEGORY STOCK

    if (categoryName) {

      query = `

        query {

          productsByCategory(

            categoryName: "${categoryName}"

          ) {

            name
            price
            quantity
          }
        }
      `
    }

    // ALL STOCK

    else {

      query = `

        query {

          products {

            name
            price
            quantity
          }
        }
      `
    }

    const response =
      await axios.post(

        "http://localhost:4000/graphql",

        {
          query
        }
      )

    const products =
      categoryName

        ? response.data.data.productsByCategory

        : response.data.data.products

    if (products.length === 0) {

      return bot.sendMessage(

        chatId,

        "❌ No products found"
      )
    }

    const stockMessage =

      products.map(

        (p: any, index: number) =>

          `${index + 1}. ${p.name}

Price: ₹${p.price}

Quantity: ${p.quantity}`

      ).join("\n\n")

    bot.sendMessage(

      chatId,

      categoryName

        ? `📦 ${categoryName} STOCK\n\n${stockMessage}`

        : `📦 ALL STOCK\n\n${stockMessage}`
    )

  } catch (error) {

    console.log(error)

    bot.sendMessage(

      chatId,

      "❌ Failed to fetch stock"
    )
  }
})

// BILL COMMAND
bot.onText(/\/bill/, async (msg) => {

  const chatId = msg.chat.id

  const parts =
    msg.text?.trim().split(/\s+/) ?? []

  const paymentType =
    parts[parts.length - 1]

  const items = []

  for (

    let i = 1;

    i < parts.length - 1;

    i += 2

  ) {

    items.push({

      name: parts[i],

      quantity: Number(parts[i + 1])
    })
  }

  try {

    const response =
      await axios.post(

        "http://localhost:4000/graphql",

        {

          query: `

            mutation {

              multiBill(

                items: "${JSON.stringify(items).replace(/"/g, '\\"')}"

                paymentType: "${paymentType}"

              )
            }
          `
        }
      )

    const bill =
      response.data.data.multiBill

    if (!bill) {
      const errMsg = response.data.errors?.[0]?.message || "Unknown error"
      return bot.sendMessage(chatId, `❌ Failed: ${errMsg}`)
    }

    bot.sendMessage(

      chatId,

      bill
    )

  } catch (error) {

    console.log(error)

    bot.sendMessage(

      chatId,

      "❌ Billing failed"
    )
  }
})

bot.onText(/\/addcategory/, async (msg) => {

  const chatId = msg.chat.id

  const parts =
    msg.text?.trim().split(/\s+/)

  const categoryName =
    parts?.[1]

  try {

    const response =
      await axios.post(

        "http://localhost:4000/graphql",

        {

          query: `

            mutation {

              addCategory(

                name: "${categoryName}"

              ) {

                id
                name
              }
            }
          `
        }
      )

    const category =
      response.data.data.addCategory

    bot.sendMessage(

      chatId,

      `
✅ Category Added

Name: ${category.name}
`
    )

  } catch (error) {

    console.log(error)

    bot.sendMessage(

      chatId,

      "❌ Failed to add category"
    )
  }
})

