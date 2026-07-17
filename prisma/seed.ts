import { PrismaClient } from '@prisma/client';
import { hash } from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // ─── Create demo host ──────────────────────────────────────────────
  const host = await prisma.user.upsert({
    where: { email: 'host@quizify.dev' },
    update: {},
    create: {
      email: 'host@quizify.dev',
      passwordHash: await hash('password123', 12),
      name: 'Demo Host',
      role: 'HOST',
    },
  });
  console.log(`  ✓ Host: ${host.email}`);

  // ─── Create demo participant ───────────────────────────────────────
  const participant = await prisma.user.upsert({
    where: { email: 'player@quizify.dev' },
    update: {},
    create: {
      email: 'player@quizify.dev',
      passwordHash: await hash('password123', 12),
      name: 'Demo Player',
      role: 'PARTICIPANT',
    },
  });
  console.log(`  ✓ Participant: ${participant.email}`);

  // ─── Create demo quiz ──────────────────────────────────────────────
  // Delete existing demo quiz if any
  await prisma.quiz.deleteMany({ where: { hostId: host.id, title: 'Web Development Fundamentals' } });

  const quiz = await prisma.quiz.create({
    data: {
      hostId: host.id,
      title: 'Web Development Fundamentals',
      description: 'Test your knowledge of HTML, CSS, JavaScript, and modern web technologies!',
      questions: {
        create: [
          {
            order: 0,
            prompt: 'What does HTML stand for?',
            type: 'QUIZ',
            timeLimit: 20,
            pointsMode: 'STANDARD',
            singleSelect: true,
            answers: {
              create: [
                { index: 0, text: 'Hyper Text Markup Language', isCorrect: true },
                { index: 1, text: 'High Tech Modern Language', isCorrect: false },
                { index: 2, text: 'Hyper Transfer Markup Language', isCorrect: false },
                { index: 3, text: 'Home Tool Markup Language', isCorrect: false },
              ],
            },
          },
          {
            order: 1,
            prompt: 'Which CSS property is used to change text color?',
            type: 'QUIZ',
            timeLimit: 15,
            pointsMode: 'STANDARD',
            singleSelect: true,
            answers: {
              create: [
                { index: 0, text: 'font-color', isCorrect: false },
                { index: 1, text: 'color', isCorrect: true },
                { index: 2, text: 'text-color', isCorrect: false },
                { index: 3, text: 'foreground-color', isCorrect: false },
              ],
            },
          },
          {
            order: 2,
            prompt: 'JavaScript is a compiled language.',
            type: 'TRUE_FALSE',
            timeLimit: 10,
            pointsMode: 'STANDARD',
            singleSelect: true,
            answers: {
              create: [
                { index: 0, text: 'True', isCorrect: false },
                { index: 1, text: 'False', isCorrect: true },
              ],
            },
          },
          {
            order: 3,
            prompt: 'What does CSS stand for?',
            type: 'QUIZ',
            timeLimit: 20,
            pointsMode: 'STANDARD',
            singleSelect: true,
            answers: {
              create: [
                { index: 0, text: 'Computer Style Sheets', isCorrect: false },
                { index: 1, text: 'Creative Style System', isCorrect: false },
                { index: 2, text: 'Cascading Style Sheets', isCorrect: true },
                { index: 3, text: 'Colorful Style Sheets', isCorrect: false },
              ],
            },
          },
          {
            order: 4,
            prompt: 'Which tag is used for the largest heading in HTML?',
            type: 'QUIZ',
            timeLimit: 15,
            pointsMode: 'DOUBLE',
            singleSelect: true,
            answers: {
              create: [
                { index: 0, text: '<heading>', isCorrect: false },
                { index: 1, text: '<h6>', isCorrect: false },
                { index: 2, text: '<h1>', isCorrect: true },
                { index: 3, text: '<head>', isCorrect: false },
              ],
            },
          },
          {
            order: 5,
            prompt: 'What is the correct syntax for a JavaScript arrow function?',
            type: 'QUIZ',
            timeLimit: 20,
            pointsMode: 'STANDARD',
            singleSelect: true,
            answers: {
              create: [
                { index: 0, text: 'function => {}', isCorrect: false },
                { index: 1, text: '() => {}', isCorrect: true },
                { index: 2, text: '=> function() {}', isCorrect: false },
                { index: 3, text: 'func() => {}', isCorrect: false },
              ],
            },
          },
          {
            order: 6,
            prompt: 'React is a JavaScript framework.',
            type: 'TRUE_FALSE',
            timeLimit: 10,
            pointsMode: 'STANDARD',
            singleSelect: true,
            answers: {
              create: [
                { index: 0, text: 'True', isCorrect: false },
                { index: 1, text: 'False', isCorrect: true },
              ],
            },
          },
          {
            order: 7,
            prompt: 'Which method is used to add an element to the end of an array in JavaScript?',
            type: 'QUIZ',
            timeLimit: 15,
            pointsMode: 'STANDARD',
            singleSelect: true,
            answers: {
              create: [
                { index: 0, text: '.add()', isCorrect: false },
                { index: 1, text: '.append()', isCorrect: false },
                { index: 2, text: '.insert()', isCorrect: false },
                { index: 3, text: '.push()', isCorrect: true },
              ],
            },
          },
          {
            order: 8,
            prompt: 'What does the "box-sizing: border-box" CSS property do?',
            type: 'QUIZ',
            timeLimit: 20,
            pointsMode: 'DOUBLE',
            singleSelect: true,
            answers: {
              create: [
                { index: 0, text: 'Adds a border to the box', isCorrect: false },
                { index: 1, text: 'Includes padding and border in the element\'s total width', isCorrect: true },
                { index: 2, text: 'Makes the box circular', isCorrect: false },
                { index: 3, text: 'Removes margin from the box', isCorrect: false },
              ],
            },
          },
          {
            order: 9,
            prompt: 'Which HTTP method is used to update a resource?',
            type: 'QUIZ',
            timeLimit: 20,
            pointsMode: 'STANDARD',
            singleSelect: true,
            answers: {
              create: [
                { index: 0, text: 'GET', isCorrect: false },
                { index: 1, text: 'POST', isCorrect: false },
                { index: 2, text: 'PUT', isCorrect: true },
                { index: 3, text: 'DELETE', isCorrect: false },
              ],
            },
          },
        ],
      },
    },
  });

  console.log(`  ✓ Quiz: "${quiz.title}" (${10} questions)`);
  console.log('\n✅ Seed complete!\n');
  console.log('  Demo credentials:');
  console.log('  Host:        host@quizify.dev / password123');
  console.log('  Participant: player@quizify.dev / password123');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
