import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function test() {
  try {
    const count = await prisma.chatMessage.count();
    console.log('✅ ChatMessage count:', count);

    const msg = await prisma.chatMessage.create({
      data: {
        tournamentId: 'global',
        senderName: 'Test',
        senderPhone: '0000',
        senderGameId: 'TEST',
        text: 'Test message',
        imageUrl: '',
        isAdmin: false
      }
    });
    console.log('✅ Message créé:', JSON.stringify(msg));

    await prisma.chatMessage.delete({ where: { id: msg.id } });
    console.log('✅ Message supprimé. TOUT EST OK !');
  } catch(e) {
    console.error('❌ ERREUR:', e.message);
    console.error('Code:', e.code);
    console.error('Meta:', e.meta);
  } finally {
    await prisma.$disconnect();
  }
}

test();
