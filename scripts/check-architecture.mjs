import { readFileSync } from 'node:fs';
import { globSync } from 'node:fs';
import { relative } from 'node:path';

const forbiddenInDomain = [
  '@nestjs/',
  '@prisma/',
  'prisma',
  'typeorm',
  'sequelize',
  'mongoose',
  'kafkajs',
  'amqplib',
  '@grpc/',
  'class-validator',
  'class-transformer',
  '@nestjs/swagger',
];

const forbiddenInFeatures = [
  '/adapters/',
  '@nestjs/',
  '@prisma/',
  'kafkajs',
  'amqplib',
  '@grpc/',
  '@nestjs/swagger',
];

const violations = [];

function importsOf(source) {
  const matches = source.matchAll(/(?:import|export)\s+(?:type\s+)?(?:[^'"]+from\s+)?['"]([^'"]+)['"]/g);
  return [...matches].map((match) => match[1]);
}

function addViolation(file, reason) {
  violations.push(`${relative(process.cwd(), file)}: ${reason}`);
}

for (const file of globSync('libs/**/domain/**/*.ts')) {
  const source = readFileSync(file, 'utf8');
  for (const specifier of importsOf(source)) {
    if (forbiddenInDomain.some((forbidden) => specifier.includes(forbidden))) {
      addViolation(file, `domain imports forbidden dependency "${specifier}"`);
    }
  }
}

for (const file of globSync('libs/**/features/**/*.ts')) {
  const source = readFileSync(file, 'utf8');
  for (const specifier of importsOf(source)) {
    if (forbiddenInFeatures.some((forbidden) => specifier.includes(forbidden))) {
      addViolation(file, `feature imports forbidden dependency "${specifier}"`);
    }
  }
}

for (const file of globSync('libs/**/*.ts')) {
  const source = readFileSync(file, 'utf8');
  for (const specifier of importsOf(source)) {
    const crossContextInfra = specifier.match(/^@social-monitor\/([^/]+)\/adapters/);
    if (crossContextInfra) {
      addViolation(file, `cross-context adapter import is forbidden: "${specifier}"`);
    }
  }
}

if (violations.length > 0) {
  console.error(violations.join('\n'));
  process.exit(1);
}

console.log('Architecture boundaries OK');
