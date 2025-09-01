import { PrismaClient } from "../generated/prisma";

const db = new PrismaClient();

export {db};
