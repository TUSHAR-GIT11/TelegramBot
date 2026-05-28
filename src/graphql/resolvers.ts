import prisma from "../lib/prisma"

export const resolvers = {
  Query: {

    products: async () => {

      return prisma.product.findMany({

        include: {

          category: true
        }
      })
    },

    productsByCategory: async (

      _: unknown,

      {
        categoryName

      }: {

        categoryName: string
      }

    ) => {

      return prisma.product.findMany({

        where: {

          category: {

            name: categoryName
          }
        },

        include: {

          category: true
        }
      })
    },

    lowStockProducts: async () => {

      const products =
        await prisma.product.findMany({

          where: {

            quantity: {

              lte: 3
            }
          }
        })

      if (products.length === 0) {

        return `
✅ No low stock products
`
      }

      const stockMessage =

        products.map(

          (p) =>

            `${p.name} → ${p.quantity} left`

        ).join("\n\n")

      return `

⚠️ LOW STOCK PRODUCTS

${stockMessage}
`
    },

    profitReport: async () => {

      const bills =
        await prisma.bill.findMany()

      const expenses =
        await prisma.expense.findMany()

      let revenue = 0

      let totalExpenses = 0

      for (const bill of bills) {

        revenue += bill.totalAmount
      }

      for (const expense of expenses) {

        totalExpenses += expense.amount
      }

      const profit =
        revenue - totalExpenses

      return `

💰 PROFIT REPORT

Revenue: ₹${revenue}

Expenses: ₹${totalExpenses}

Profit: ₹${profit}
`
    },

    salesReport: async () => {

      const bills =
        await prisma.bill.findMany()

      let cash = 0

      let upi = 0

      let card = 0

      let total = 0

      for (const bill of bills) {

        total += bill.totalAmount

        if (
          bill.paymentType.toLowerCase()
          === "cash"
        ) {

          cash += bill.totalAmount
        }

        else if (
          bill.paymentType.toLowerCase()
          === "upi"
        ) {

          upi += bill.totalAmount
        }

        else if (
          bill.paymentType.toLowerCase()
          === "card"
        ) {

          card += bill.totalAmount
        }
      }

      return `

💰 SALES REPORT

Cash: ₹${cash}

UPI: ₹${upi}

Card: ₹${card}

TOTAL: ₹${total}
`
    }
  },
  Mutation: {

    addCategory: async (_: unknown, { name }: { name: string }) => {
      return prisma.category.create({
        data: {
          name
        }
      })
    },
    addProduct: async (_: unknown, { name, price, quantity, categoryName }: { name: string, price: number, quantity: number, categoryName?: string }) => {

      let categoryId: number | undefined = undefined

      if (categoryName) {
        const category = await prisma.category.findFirst({
          where: { name: categoryName }
        })
        if (!category) {
          throw new Error("Category not found")
        }
        categoryId = category.id
      }

      return prisma.product.upsert({
        where: { name },
        update: { price, quantity },
        create: {
          name,
          price,
          quantity,
          ...(categoryId ? { categoryId } : {})
        }
      })
    },

    addExpense: async (_: unknown, { title, amount }: { title: string, amount: number }) => {
      return prisma.expense.create({
        data: {
          title,
          amount
        }
      })
    },

    multiBill: async (

      _: unknown,

      {
        items,
        paymentType

      }: {

        items: string

        paymentType: string
      }

    ) => {

      const parsedItems =
        JSON.parse(items)

      let total = 0

      let billText = ""

      for (const item of parsedItems) {

        const product =
          await prisma.product.findFirst({

            where: {

              name: item.name
            }
          })

        // PRODUCT NOT FOUND

        if (!product) {

          throw new Error(

            `${item.name} not found`
          )
        }

        // STOCK CHECK

        if (product.quantity < item.quantity) {

          throw new Error(

            `${item.name} insufficient stock`
          )
        }

        // ITEM TOTAL

        const itemTotal =
          product.price * item.quantity

        total += itemTotal

        // BILL TEXT

        billText += `

${product.name} x${item.quantity}
= ₹${itemTotal}
`

        // STOCK REDUCE

        await prisma.product.update({

          where: {

            id: product.id
          },

          data: {

            quantity: {

              decrement: item.quantity
            }
          }
        })
      }

      // SAVE BILL

      await prisma.bill.create({

        data: {

          totalAmount: total,

          paymentType
        }
      })

      // FINAL BILL RETURN

      return `

🧾 BILL

${billText}

Payment: ${paymentType.toUpperCase()}

TOTAL = ₹${total}
`
    },

    billProduct: async (
      _: unknown,
      { name, quantity }: { name: string; quantity: number }
    ) => {
      const product = await prisma.product.findFirst({
        where: { name }
      })

      if (!product) {
        throw new Error("Product not found")
      }

      if (product.quantity < quantity) {
        throw new Error("Insufficient stock")
      }

      return prisma.product.update({
        where: { id: product.id },
        data: { quantity: { decrement: quantity } }
      })
    }
  }
}
