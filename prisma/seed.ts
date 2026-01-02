import { PrismaClient, Role, Sex, VehicleType, TransactionType } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
    console.log('🌱 Starting database seed...');

    // Clear existing data
    console.log('🗑️  Clearing existing data...');
    await prisma.transaction.deleteMany();
    await prisma.wallet.deleteMany();
    await prisma.commission.deleteMany();
    await prisma.rating.deleteMany();
    await prisma.ride.deleteMany();
    await prisma.vehicle.deleteMany();
    await prisma.driverStatus.deleteMany();
    await prisma.driverProfile.deleteMany();
    await prisma.verification.deleteMany();
    await prisma.passwordResetToken.deleteMany();
    await prisma.refreshToken.deleteMany();
    await prisma.notification.deleteMany();
    await prisma.giftCard.deleteMany();
    await prisma.user.deleteMany();

    const hashedPassword = await bcrypt.hash('password123', 12);

    // Create Admin User
    console.log('👤 Creating admin user...');
    const admin = await prisma.user.create({
        data: {
            email: 'admin@vtc.dz',
            password: hashedPassword,
            phoneNumber: '+213555000001',
            firstName: 'Admin',
            lastName: 'User',
            role: Role.ADMIN,
            sex: Sex.MALE,
            address: '123 Admin Street',
            wilaya: 'Algiers',
            commune: 'Hydra',
        },
    });

    // Create admin wallet with 1000 DA
    await prisma.wallet.create({
        data: {
            userId: admin.id,
            balance: 100000, // 1000 DA (in cents)
            transactions: {
                create: {
                    type: TransactionType.CREDIT,
                    amount: 100000,
                    reference: 'Initial seed balance',
                },
            },
        },
    });

    // Create Regular Users
    console.log('👥 Creating regular users...');
    const users = [];
    for (let i = 1; i <= 3; i++) {
        const user = await prisma.user.create({
            data: {
                email: `user${i}@vtc.dz`,
                password: hashedPassword,
                phoneNumber: `+21355500000${i + 1}`,
                firstName: `User`,
                lastName: `${i}`,
                role: Role.USER,
                sex: i % 2 === 0 ? Sex.FEMALE : Sex.MALE,
                dateOfBirth: new Date(1990 + i, i, 15),
                address: `${i * 10} User Street`,
                wilaya: i === 1 ? 'Algiers' : i === 2 ? 'Oran' : 'Constantine',
                commune: i === 1 ? 'Bab El Oued' : i === 2 ? 'Bir El Djir' : 'El Khroub',
            },
        });

        // Create wallet with 1000 DA for each user
        await prisma.wallet.create({
            data: {
                userId: user.id,
                balance: 100000, // 1000 DA (in cents)
                transactions: {
                    create: {
                        type: TransactionType.CREDIT,
                        amount: 100000,
                        reference: 'Initial seed balance',
                    },
                },
            },
        });

        users.push(user);
    }

    // Create Drivers
    console.log('🚗 Creating drivers...');
    const drivers = [];
    for (let i = 1; i <= 3; i++) {
        const driver = await prisma.user.create({
            data: {
                email: `driver${i}@vtc.dz`,
                password: hashedPassword,
                phoneNumber: `+21355500001${i}`,
                firstName: `Driver`,
                lastName: `${i}`,
                role: Role.DRIVER,
                sex: Sex.MALE,
                dateOfBirth: new Date(1985 + i, i, 20),
                address: `${i * 20} Driver Avenue`,
                wilaya: i === 1 ? 'Algiers' : i === 2 ? 'Oran' : 'Annaba',
                commune: i === 1 ? 'Kouba' : i === 2 ? 'Es Senia' : 'Sidi Amar',
                driverProfile: {
                    create: {
                        isActive: true,
                        vehicles: {
                            create: {
                                type: i === 1 ? VehicleType.CAR : VehicleType.BIKE,
                                model: i === 1 ? 'Renault Symbol' : i === 2 ? 'Peugeot 208' : 'Honda CBR',
                                year: 2020 + i,
                                plate: `${i}6-${1000 + i * 111}-${i}6`,
                                isActive: true,
                            },
                        },
                        status: {
                            create: {
                                isOnline: i === 1,
                                lat: 36.7538 + (i * 0.1),
                                lng: 3.0588 + (i * 0.1),
                            },
                        },
                    },
                },
            },
        });

        // Create wallet with 1000 DA for each driver
        await prisma.wallet.create({
            data: {
                userId: driver.id,
                balance: 100000, // 1000 DA (in cents)
                transactions: {
                    create: {
                        type: TransactionType.CREDIT,
                        amount: 100000,
                        reference: 'Initial seed balance',
                    },
                },
            },
        });

        drivers.push(driver);
    }

    // Create some gift cards
    console.log('🎁 Creating gift cards...');
    await prisma.giftCard.createMany({
        data: [
            {
                code: 'GIFT-1000-ABC123',
                amount: 100000, // 1000 DA
                isUsed: false,
            },
            {
                code: 'GIFT-500-DEF456',
                amount: 50000, // 500 DA
                isUsed: false,
            },
            {
                code: 'GIFT-2000-GHI789',
                amount: 200000, // 2000 DA
                isUsed: false,
            },
        ],
    });

    console.log('✅ Database seeded successfully!');
    console.log('\n📊 Summary:');
    console.log(`   - 1 Admin user (admin@vtc.dz)`);
    console.log(`   - 3 Regular users (user1-3@vtc.dz)`);
    console.log(`   - 3 Drivers (driver1-3@vtc.dz)`);
    console.log(`   - All users have wallets with 1000 DA balance`);
    console.log(`   - 3 Gift cards created`);
    console.log(`   - Password for all users: password123`);
    console.log('\n💰 Wallet balances:');
    console.log(`   - All accounts: 1000 DA (100000 cents)`);
}

main()
    .catch((e) => {
        console.error('❌ Error seeding database:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
