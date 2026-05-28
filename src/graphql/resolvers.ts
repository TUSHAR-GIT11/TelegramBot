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

    productsByCategory: async (_: unknown, { categoryName }: { categoryName: string }) => {
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
