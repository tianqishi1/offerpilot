import { PDFDocument, StandardFonts } from 'pdf-lib';
import { writeFileSync } from 'node:fs';
const doc = await PDFDocument.create();
const page = doc.addPage([595, 842]);
const font = await doc.embedFont(StandardFonts.Helvetica);
const lines = [
  'XIAO LIN',
  'Huazhong University of Science and Technology',
  'Computer Science and Technology, Master, expected graduation 2027',
  'Target city: Beijing | Target role: Backend Developer',
  '',
  'INTERNSHIP',
  'X Company - Backend Developer Intern (2026.03 - 2026.09)',
  'Built Go microservices for order system; improved API latency by 30%.',
  '',
  'PROJECT',
  'Distributed KV Store - course project, Raft consensus, Go.',
  '',
  'SKILLS: Go, Java, MySQL, Redis, Docker',
  'Phone: 13800000000  ID: 110101200001011234',
];
lines.forEach((l, i) => page.drawText(l, { x: 50, y: 790 - i * 22, size: 10, font }));
writeFileSync(new URL('../../.tmp/test-resume.pdf', import.meta.url), Buffer.from(await doc.save()));
console.log('test resume written');

