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

// ─── CONVERSATION STATE ───────────────────────────────────────────────────────

type Step =
  | "add_name" | "add_price" | "add_quantity"
  | "bill_product_name" | "bill_product_qty" | "bill_payment" | "bill_discount" | "bill_customer"
  | "expense_title" | "expense_amount"
  | "restock_name" | "restock_qty"
  | "markpaid_id"
  | "billsbydate_input"

interface UserState {
  step: Step
  data: Record<string, any>
}

const userStates = new Map<number, UserState>()

function setState(chatId: number, step: Step, data: Record<string, any> = {}) {
  userStates.set(chatId, { step, data })
}

function clearState(chatId: number) {
  userStates.delete(chatId)
}

// ─── MESSAGE HANDLER (handles all conversation steps) ────────────────────────
bot.on("message", async (msg) => {
  const chatId = msg.chat.id
  const text = msg.text?.trim()

  if (!text || text.startsWith("/")) return

  const state = userStates.get(chatId)
  if (!state) return

  switch (state.step) {

    // ── ADD PRODUCT FLOW ──
    case "add_name": {
      setState(chatId, "add_price", { name: text })
      bot.sendMessage(chatId, `💰 Enter Price:`)
      break
    }

    case "add_price": {
      const price = Number(text)
      if (isNaN(price) || price <= 0) {
        return bot.sendMessage(chatId, "❌ Invalid price. Enter a number:")
      }
      setState(chatId, "add_quantity", { ...state.data, price })
      bot.sendMessage(chatId, `📦 Enter Quantity:`)
      break
    }

    case "add_quantity": {
      const quantity = Number(text)
      if (isNaN(quantity) || quantity <= 0) {
        return bot.sendMessage(chatId, "❌ Invalid quantity. Enter a number:")
      }
      const { name, price } = state.data
      clearState(chatId)

      try {
        const res = await axios.post(GRAPHQL_URL, {
          query: `mutation { addProduct(name: "${name}", price: ${price}, quantity: ${quantity}) { name price quantity } }`
        })
        const product = res.data.data.addProduct
        if (!product) {
          const err = res.data.errors?.[0]?.message || "Unknown error"
          return bot.sendMessage(chatId, `❌ Failed: ${err}`)
        }
        bot.sendMessage(chatId, `✅ Product Added\n\nName: ${product.name}\nPrice: ₹${product.price}\nQuantity: ${product.quantity}`)
      } catch (e) {
        bot.sendMessage(chatId, "❌ Failed to add product")
      }
      break
    }

    // ── BILL FLOW ──
    case "bill_product_name": {
      setState(chatId, "bill_product_qty", { ...state.data, currentName: text })
      bot.sendMessage(chatId, `📦 Quantity?`)
      break
    }

    case "bill_product_qty": {
      const qty = Number(text)
      if (isNaN(qty) || qty <= 0) {
        return bot.sendMessage(chatId, "❌ Invalid quantity. Enter a number:")
      }
      const items = state.data.items || []
      items.push({ name: state.data.currentName, quantity: qty })
      setState(chatId, "bill_product_name", { ...state.data, items, currentName: undefined })

      bot.sendMessage(chatId, `Add another product?`, {
        reply_markup: {
          inline_keyboard: [[
            { text: "✅ Yes", callback_data: "bill_add_more" },
            { text: "❌ No", callback_data: "bill_done_items" }
          ]]
        }
      })
      break
    }

    case "bill_discount": {
      const discount = Number(text)
      if (isNaN(discount) || discount < 0 || discount > 100) {
        return bot.sendMessage(chatId, "❌ Invalid discount. Enter 0-100:")
      }
      setState(chatId, "bill_customer", { ...state.data, discount })
      bot.sendMessage(chatId, `👤 Customer Name? (or type "skip")`)
      break
    }

    case "bill_customer": {
      const customerName = text.toLowerCase() === "skip" ? undefined : text
      const { items, paymentType, discount } = state.data
      clearState(chatId)

      try {
        const customerArg = customerName ? `, customerName: "${customerName}"` : ""
        const res = await axios.post(GRAPHQL_URL, {
          query: `mutation {
            multiBill(
              items: "${JSON.stringify(items).replace(/"/g, '\\"')}",
              paymentType: "${paymentType}",
              discount: ${discount}${customerArg}
            )
          }`
        })
        const bill = res.data.data.multiBill
        if (!bill) {
          const err = res.data.errors?.[0]?.message || "Unknown error"
          return bot.sendMessage(chatId, `❌ Failed: ${err}`)
        }
        bot.sendMessage(chatId, bill)
      } catch (e) {
        bot.sendMessage(chatId, "❌ Billing failed")
      }
      break
    }

    case "markpaid_id": {
      const billId = Number(text)
      if (isNaN(billId)) {
        return bot.sendMessage(chatId, "❌ Invalid Bill ID. Enter a number:")
      }
      clearState(chatId)

      try {
        const res = await axios.post(GRAPHQL_URL, {
          query: `mutation { markPaid(billId: ${billId}) }`
        })
        const result = res.data.data.markPaid
        if (!result) {
          const err = res.data.errors?.[0]?.message || "Unknown error"
          return bot.sendMessage(chatId, `❌ Failed: ${err}`)
        }
        bot.sendMessage(chatId, result)
      } catch (e) {
        bot.sendMessage(chatId, "❌ Failed to mark payment")
      }
      break
    }

    case "billsbydate_input": {
      // Accept formats: DD/MM/YYYY, DD-MM-YYYY, or DDMMYYYY (8 digits)
      let normalizedDate = text

      if (/^\d{8}$/.test(text)) {
        // DDMMYYYY → DD/MM/YYYY
        normalizedDate = `${text.slice(0, 2)}/${text.slice(2, 4)}/${text.slice(4, 8)}`
      }

      // Validate: must be DD/MM/YYYY or DD-MM-YYYY
      if (!/^\d{2}[\/\-]\d{2}[\/\-]\d{4}$/.test(normalizedDate)) {
        return bot.sendMessage(chatId, `❌ Invalid date format!\n\nSahi format:\n• DD/MM/YYYY → 31/05/2026\n• DD-MM-YYYY → 31-05-2026\n• DDMMYYYY   → 31052026`)
      }

      clearState(chatId)
      try {
        const res = await axios.post(GRAPHQL_URL, {
          query: `query { billsByDate(date: "${normalizedDate}") }`
        })
        const report = res.data.data.billsByDate
        if (!report) {
          const err = res.data.errors?.[0]?.message || "Unknown error"
          return bot.sendMessage(chatId, `❌ ${err}`)
        }
        bot.sendMessage(chatId, report)
      } catch (e) {
        bot.sendMessage(chatId, "❌ Failed to fetch bills")
      }
      break
    }

    // ── RESTOCK FLOW ──
    case "restock_name": {
      setState(chatId, "restock_qty", { name: text })
      bot.sendMessage(chatId, `📦 Enter Quantity to Add:`)
      break
    }

    case "restock_qty": {
      const qty = Number(text)
      if (isNaN(qty) || qty <= 0) {
        return bot.sendMessage(chatId, "❌ Invalid quantity. Enter a number:")
      }
      const { name } = state.data
      clearState(chatId)

      try {
        const res = await axios.post(GRAPHQL_URL, {
          query: `mutation { restockProduct(name: "${name}", quantity: ${qty}) { name quantity } }`
        })
        const product = res.data.data.restockProduct
        if (!product) {
          const err = res.data.errors?.[0]?.message || "Unknown error"
          return bot.sendMessage(chatId, `❌ Failed: ${err}`)
        }
        bot.sendMessage(chatId, `✅ Restocked!\n\nProduct: ${product.name}\nNew Stock: ${product.quantity}`)
      } catch (e) {
        bot.sendMessage(chatId, "❌ Restock failed")
      }
      break
    }

    // ── ADD EXPENSE FLOW ──
    case "expense_title": {
      setState(chatId, "expense_amount", { title: text })
      bot.sendMessage(chatId, `💰 Enter Amount:`)
      break
    }

    case "expense_amount": {
      const amount = Number(text)
      if (isNaN(amount) || amount <= 0) {
        return bot.sendMessage(chatId, "❌ Invalid amount. Enter a number:")
      }
      const { title } = state.data
      clearState(chatId)

      try {
        const res = await axios.post(GRAPHQL_URL, {
          query: `mutation { addExpense(title: "${title}", amount: ${amount}) { title amount } }`
        })
        const expense = res.data.data.addExpense
        bot.sendMessage(chatId, `✅ Expense Added\n\nTitle: ${expense.title}\nAmount: ₹${expense.amount}`)
      } catch (e) {
        bot.sendMessage(chatId, "❌ Failed to add expense")
      }
      break
    }
  }
})

// START COMMAND
bot.onText(/\/start/, (msg) => {
  bot.sendMessage(
    msg.chat.id,
    `📋 STOCK MANAGEMENT SYSTEM\n\nChoose an option:`,
    {
      reply_markup: {
        inline_keyboard: [
          [
            { text: "🧾 Create Bill", callback_data: "menu_bill" },
            { text: "📦 Show Stock", callback_data: "menu_stock" }
          ],
          [
            { text: "➕ Add Product", callback_data: "menu_addproduct" },
            { text: "� Restock Product", callback_data: "menu_restock" }
          ],
          [
            { text: "💰 Sales Report", callback_data: "menu_sales" },
            { text: "� Today's Report", callback_data: "menu_report" }
          ],
          [
            { text: "💸 Add Expense", callback_data: "menu_expense" },
            { text: "� Profit Report", callback_data: "menu_profit" }
          ],
          [
            { text: "� Sales Report", callback_data: "menu_sales" },
            { text: "📄 Bill History", callback_data: "menu_billhistory" }
          ],
          [
            { text: "💸 Add Expense", callback_data: "menu_expense" },
            { text: "📊 Today's Report", callback_data: "menu_report" }
          ],
          [
            { text: "📈 Profit Report", callback_data: "menu_profit" },
            { text: "💳 Pending Payments", callback_data: "menu_pending" }
          ],
          [
            { text: "⚠️ Low Stock", callback_data: "menu_lowstock" },
            { text: "🏆 Top Products", callback_data: "menu_topproducts" }
          ]
        ]
      }
    }
  )
})

// BUTTON CALLBACKS
bot.on("callback_query", (query) => {
  const chatId = query.message?.chat.id
  if (!chatId) return

  bot.answerCallbackQuery(query.id)

  switch (query.data) {
    case "menu_addproduct":
      setState(chatId, "add_name")
      bot.sendMessage(chatId, `➕ *Add Product*\n\nEnter Product Name:`, { parse_mode: "Markdown" })
      break

    case "menu_stock":
      axios.post("http://localhost:4000/graphql", {
        query: `query { products { name price quantity } }`
      }).then(res => {
        const products = res.data.data.products
        if (!products || products.length === 0) {
          return bot.sendMessage(chatId, "❌ No products found")
        }
        const msg = products
          .map((p: any, i: number) => `${i + 1}. ${p.name}\nPrice: ₹${p.price}\nQty: ${p.quantity}`)
          .join("\n\n")
        bot.sendMessage(chatId, `📦 STOCK\n\n${msg}`)
      }).catch(() => bot.sendMessage(chatId, "❌ Failed to fetch stock"))
      break

    case "menu_bill":
      setState(chatId, "bill_product_name", { items: [] })
      bot.sendMessage(chatId, `🧾 *Create Bill*\n\nProduct Name?`, { parse_mode: "Markdown" })
      break

    case "menu_billhistory": {
      setState(chatId, "billsbydate_input")
      bot.sendMessage(chatId, `📅 Enter date (DD/MM/YYYY)\nExample: 01/06/2026`)
      break
    }

    case "menu_sales":
      axios.post("http://localhost:4000/graphql", {
        query: `query { salesReport }`
      }).then(res => {
        const report = res.data.data.salesReport
        bot.sendMessage(chatId, report || "❌ No data found")
      }).catch(() => bot.sendMessage(chatId, "❌ Failed to fetch sales report"))
      break

    case "menu_expense":
      setState(chatId, "expense_title")
      bot.sendMessage(chatId, `💸 *Add Expense*\n\nEnter Expense Title:`, { parse_mode: "Markdown" })
      break

    case "menu_restock":
      setState(chatId, "restock_name")
      bot.sendMessage(chatId, `🔄 *Restock Product*\n\nEnter Product Name:`, { parse_mode: "Markdown" })
      break

    case "menu_profit":
      axios.post("http://localhost:4000/graphql", {
        query: `query { profitReport }`
      }).then(res => {
        const report = res.data.data.profitReport
        bot.sendMessage(chatId, report || "❌ No data found")
      }).catch(() => bot.sendMessage(chatId, "❌ Failed to fetch profit report"))
      break

    case "menu_lowstock":
      axios.post("http://localhost:4000/graphql", {
        query: `query { lowStockProducts }`
      }).then(res => {
        const report = res.data.data.lowStockProducts
        bot.sendMessage(chatId, report || "❌ No data found")
      }).catch(() => bot.sendMessage(chatId, "❌ Failed to fetch low stock"))
      break

    case "menu_pending":
      axios.post("http://localhost:4000/graphql", {
        query: `query { pendingPayments }`
      }).then(res => {
        const report = res.data.data.pendingPayments
        bot.sendMessage(chatId, report || "✅ No pending payments", {
          reply_markup: {
            inline_keyboard: [[
              { text: "✅ Mark as Paid", callback_data: "markpaid_start" }
            ]]
          }
        })
      }).catch(() => bot.sendMessage(chatId, "❌ Failed to fetch pending payments"))
      break

    case "markpaid_start":
      setState(chatId, "markpaid_id")
      bot.sendMessage(chatId, `Enter Bill ID # to mark as paid:`)
      break

    case "menu_topproducts":
      axios.post("http://localhost:4000/graphql", {
        query: `query { topProducts }`
      }).then(res => {
        const report = res.data.data.topProducts
        bot.sendMessage(chatId, report || "❌ No data found")
      }).catch(() => bot.sendMessage(chatId, "❌ Failed to fetch top products"))
      break

    case "menu_report":
      axios.post("http://localhost:4000/graphql", {
        query: `query { closingReport }`
      }).then(res => {
        const report = res.data.data.closingReport
        bot.sendMessage(chatId, report || "❌ No data found")
      }).catch(() => bot.sendMessage(chatId, "❌ Failed to fetch report"))
      break

    case "bill_add_more": {
      const billState = userStates.get(chatId)
      if (!billState) break
      setState(chatId, "bill_product_name", billState.data)
      bot.sendMessage(chatId, `Product Name?`)
      break
    }

    case "bill_done_items": {
      const billState = userStates.get(chatId)
      if (!billState) break
      setState(chatId, "bill_payment", billState.data)
      bot.sendMessage(chatId, `💳 Payment Method?`, {
        reply_markup: {
          inline_keyboard: [[
            { text: "💵 Cash", callback_data: "pay_cash" },
            { text: "📱 UPI", callback_data: "pay_upi" },
            { text: "💳 Card", callback_data: "pay_card" }
          ], [
            { text: "🕐 Credit (Pending)", callback_data: "pay_credit" }
          ]]
        }
      })
      break
    }

    case "pay_cash":
    case "pay_upi":
    case "pay_card":
    case "pay_credit": {
      const billState = userStates.get(chatId)
      if (!billState) break
      const paymentType = query.data!.replace("pay_", "")
      setState(chatId, "bill_discount", { ...billState.data, paymentType })
      bot.sendMessage(chatId, `🏷️ Discount % ? (Enter 0 if none)`)
      break
    }
  }
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

  if (parts.length < 6) {

    return bot.sendMessage(

      chatId,

      "❌ Usage:\n/bill bread 2 cash 0 detailed\nor\n/bill bread 2 GreenTea 1 upi 15 full"
    )
  }

  const format =
    parts[parts.length - 1]

  const discount =
    Number(parts[parts.length - 2])

  const paymentType =
    parts[parts.length - 3]

  const endIndex =
    parts.length - 3

  const items = []

  for (

    let i = 1;

    i < endIndex;

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

                discount: ${discount}

                format: "${format}"

              )
            }
          `
        }
      )

    const bill =
      response.data.data.multiBill

    if (!bill) {

      const errMsg =
        response.data.errors?.[0]?.message ||
        "Unknown error"

      return bot.sendMessage(

        chatId,

        `❌ Failed: ${errMsg}`
      )
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

bot.onText(/\/sales/, async (msg) => {

  const chatId = msg.chat.id

  try {

    const response =
      await axios.post(

        "http://localhost:4000/graphql",

        {

          query: `

            query {

              salesReport
            }
          `
        }
      )

    const report =
      response.data.data.salesReport

    bot.sendMessage(

      chatId,

      report
    )

  } catch (error) {

    console.log(error)

    bot.sendMessage(

      chatId,

      "❌ Failed to fetch sales report"
    )
  }
})

bot.onText(/\/expense/, async (msg) => {

  const chatId = msg.chat.id

  const parts =
    msg.text?.trim().split(/\s+/)

  const title =
    parts?.[1]

  const amount =
    Number(parts?.[2])

  try {

    const response =
      await axios.post(

        "http://localhost:4000/graphql",

        {

          query: `

            mutation {

              addExpense(

                title: "${title}"

                amount: ${amount}

              ) {

                id
                title
                amount
              }
            }
          `
        }
      )

    const expense =
      response.data.data.addExpense

    bot.sendMessage(

      chatId,

      `

✅ Expense Added

Title: ${expense.title}

Amount: ₹${expense.amount}
`
    )

  } catch (error) {

    console.log(error)

    bot.sendMessage(

      chatId,

      "❌ Failed to add expense"
    )
  }
})

bot.onText(/\/expense/, async (msg) => {

  const chatId = msg.chat.id

  const parts =
    msg.text?.trim().split(/\s+/)

  const title =
    parts?.[1]

  const amount =
    Number(parts?.[2])

  try {

    const response =
      await axios.post(

        "http://localhost:4000/graphql",

        {

          query: `

            mutation {

              addExpense(

                title: "${title}"

                amount: ${amount}

              ) {

                id
                title
                amount
              }
            }
          `
        }
      )

    const expense =
      response.data.data.addExpense

    bot.sendMessage(

      chatId,

      `

✅ Expense Added

Title: ${expense.title}

Amount: ₹${expense.amount}
`
    )

  } catch (error) {

    console.log(error)

    bot.sendMessage(

      chatId,

      "❌ Failed to add expense"
    )
  }
})

bot.onText(/\/profit/, async (msg) => {

  const chatId = msg.chat.id

  try {

    const response =
      await axios.post(

        "http://localhost:4000/graphql",

        {

          query: `

            query {

              profitReport
            }
          `
        }
      )

    const report =
      response.data.data.profitReport

    bot.sendMessage(

      chatId,

      report
    )

  } catch (error) {

    console.log(error)

    bot.sendMessage(

      chatId,

      "❌ Failed to fetch profit report"
    )
  }
})

bot.onText(/\/restock/, async (msg) => {

  const chatId = msg.chat.id

  const parts =
    msg.text?.trim().split(/\s+/)

  const name =
    parts?.[1]

  const quantity =
    Number(parts?.[2])

  try {

    const response =
      await axios.post(

        "http://localhost:4000/graphql",

        {

          query: `

            mutation {

              restockProduct(

                name: "${name}"

                quantity: ${quantity}

              ) {

                name
                quantity
              }
            }
          `
        }
      )

    const product =
      response.data.data.restockProduct

    bot.sendMessage(

      chatId,

      `

✅ Stock Restocked

Product: ${product.name}

Current Stock: ${product.quantity}
`
    )

  } catch (error) {

    console.log(error)

    bot.sendMessage(

      chatId,

      "❌ Restock failed"
    )
  }
})

bot.onText(/\/lowstock/, async (msg) => {

  const chatId = msg.chat.id

  try {

    const response =
      await axios.post(

        "http://localhost:4000/graphql",

        {

          query: `

            query {

              lowStockProducts
            }
          `
        }
      )

    const report =
      response.data.data.lowStockProducts

    bot.sendMessage(

      chatId,

      report
    )

  } catch (error) {

    console.log(error)

    bot.sendMessage(

      chatId,

      "❌ Failed to fetch low stock"
    )
  }
})

// REPORT COMMAND
bot.onText(/\/report/, async (msg) => {
  const chatId = msg.chat.id

  try {
    const response = await axios.post("http://localhost:4000/graphql", {
      query: `query { closingReport }`
    })

    const report = response.data.data.closingReport
    bot.sendMessage(chatId, report || "❌ No data found")
  } catch (error) {
    console.log(error)
    bot.sendMessage(chatId, "❌ Failed to fetch report")
  }
})

// TOP PRODUCTS COMMAND
bot.onText(/\/topproducts/, async (msg) => {
  const chatId = msg.chat.id

  try {
    const response = await axios.post(
      "http://localhost:4000/graphql",
      {
        query: `
          query {
            topProducts
          }
        `
      }
    )

    const report = response.data.data.topProducts

    bot.sendMessage(chatId, report)

  } catch (error) {
    console.log(error)
    bot.sendMessage(chatId, "❌ Failed to fetch top products")
  }
})


bot.onText(/\/closing/, async (msg) => {

  const chatId = msg.chat.id

  try {

    const response =
      await axios.post(

        "http://localhost:4000/graphql",

        {

          query: `

            query {

              closingReport
            }
          `
        }
      )

    const report =
      response.data.data.closingReport

    bot.sendMessage(

      chatId,

      report
    )

  } catch (error) {

    console.log(error)

    bot.sendMessage(

      chatId,

      "❌ Failed to fetch report"
    )
  }
})

bot.onText(/\/purchase/, async (msg) => {

  const chatId = msg.chat.id

  const parts =
    msg.text?.trim().split(/\s+/)

  const name =
    parts?.[1]

  const quantity =
    Number(parts?.[2])

  const costPrice =
    Number(parts?.[3])

  if (!name || !quantity || !costPrice) {

    return bot.sendMessage(

      chatId,

      "❌ Usage: /purchase productName quantity costPrice"
    )
  }

  try {

    const response =
      await axios.post(

        "http://localhost:4000/graphql",

        {

          query: `

            mutation {

              purchaseProduct(

                name: "${name}"

                quantity: ${quantity}

                costPrice: ${costPrice}

              ) {

                name

                quantity

                costPrice
              }
            }
          `
        }
      )

    const product =
      response.data.data.purchaseProduct

    bot.sendMessage(

      chatId,

      `📦 PURCHASE ENTRY

Product: ${product.name}

Added Stock: ${quantity}

Cost Price: ₹${product.costPrice}

Current Stock: ${product.quantity}`
    )

  } catch (error: any) {

  console.log(
    JSON.stringify(
      error.response?.data,
      null,
      2
    )
  )

  bot.sendMessage(
    chatId,
    "❌ Purchase entry failed"
  )
}
})