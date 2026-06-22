import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

// --- Environment Variable & Env File Loader ---
function loadEnv() {
  const searchPaths = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), '../.env'),
    path.resolve(process.cwd(), '../BackEnd/.env'),
    path.resolve(process.cwd(), 'FrontEnd/.env')
  ];
  
  const env: Record<string, string> = {};
  for (const envPath of searchPaths) {
    if (fs.existsSync(envPath)) {
      console.log(`Loading env vars from: ${envPath}`);
      const content = fs.readFileSync(envPath, 'utf-8');
      content.split('\n').forEach(line => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) return;
        const index = trimmed.indexOf('=');
        if (index === -1) return;
        const key = trimmed.substring(0, index).trim();
        let val = trimmed.substring(index + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.substring(1, val.length - 1);
        }
        env[key] = val;
      });
      break; // stop at first found env file
    }
  }
  return env;
}

const env = loadEnv();
const supabaseUrl = env.VITE_SUPABASE_URL || env.SUPABASE_URL || process.env.SUPABASE_URL || 'http://localhost:54321';
const supabaseKey = env.VITE_SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY || '';
const backendApiKey = env.API_KEY || env.VITE_BACKEND_API_KEY || 'capstone-22-6-2026';
const backendUrl = 'http://localhost:8000';

test.describe('E2E Batch Submissions and Evaluations Seeder & Verification', () => {
  // Set extended timeout since we are loading, seeding, and triggering multiple processes
  test.setTimeout(300000); 

  test('should seed classes, students, assignments, rubrics, upload PDFs and trigger background evaluations', async ({ page }) => {
    console.log('Connecting to Supabase at:', supabaseUrl);
    expect(supabaseKey).toBeTruthy();
    
    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false }
    });

    const targetClassNames = ["academic writing", "UROP", "Intro to Research"];
    const studentsData = [
      { name: "Alice", email: "alice@student.com" },
      { name: "Bob", email: "bob@student.com" },
      { name: "Charlie", email: "charlie@student.com" },
      { name: "David", email: "david@student.com" },
      { name: "Eve", email: "eve@student.com" },
      { name: "Frank", email: "frank@student.com" }
    ];

    const pdfFiles = [
      'Any-precisionLLM.pdf',
      'DP-LLM.pdf',
      'DPS.pdf',
      'Oaken.pdf',
      'TTX.pdf',
      'Tangram.pdf'
    ];

    // Verify sandbox PDFs exist before running
    const sandboxDir = path.resolve(process.cwd(), '../sandbox');
    const altSandboxDir = path.resolve(process.cwd(), 'sandbox');
    const resolvedSandboxDir = fs.existsSync(sandboxDir) ? sandboxDir : (fs.existsSync(altSandboxDir) ? altSandboxDir : null);
    
    expect(resolvedSandboxDir).not.toBeNull();
    console.log(`Using sandbox directory: ${resolvedSandboxDir}`);

    for (const file of pdfFiles) {
      const filePath = path.join(resolvedSandboxDir!, file);
      expect(fs.existsSync(filePath)).toBe(true);
    }

    // 1. Database Cleanup
    console.log('Cleaning up existing classes matching target names...');
    const { data: existingClasses } = await supabase
      .from('classes')
      .select('id')
      .in('name', targetClassNames);

    if (existingClasses && existingClasses.length > 0) {
      const classIds = existingClasses.map(c => c.id);
      
      // Fetch submissions in these classes
      const { data: existingSubmissions } = await supabase
        .from('submissions')
        .select('id')
        .in('class_id', classIds);

      if (existingSubmissions && existingSubmissions.length > 0) {
        const subIds = existingSubmissions.map(s => s.id);

        // Fetch evaluations
        const { data: existingEvals } = await supabase
          .from('evaluations')
          .select('id')
          .in('submission_id', subIds);

        if (existingEvals && existingEvals.length > 0) {
          const evalIds = existingEvals.map(e => e.id);
          await supabase.from('criteria_scores').delete().in('evaluation_id', evalIds);
          await supabase.from('evaluation_details').delete().in('evaluation_id', evalIds);
          await supabase.from('evaluations').delete().in('submission_id', subIds);
        }
        await supabase.from('submissions').delete().in('class_id', classIds);
      }

      await supabase.from('class_students').delete().in('class_id', classIds);
      await supabase.from('assignments').delete().in('class_id', classIds);
      await supabase.from('rubrics').delete().in('class_id', classIds);
      await supabase.from('classes').delete().in('id', classIds);
    }

    // Clean up student records for clean re-creation
    const studentEmails = studentsData.map(s => s.email);
    const { data: existingStudents } = await supabase
      .from('students')
      .select('id')
      .in('email', studentEmails);

    if (existingStudents && existingStudents.length > 0) {
      const studentIds = existingStudents.map(s => s.id);
      await supabase.from('class_students').delete().in('student_id', studentIds);
      await supabase.from('submissions').delete().in('student_id', studentIds);
      await supabase.from('students').delete().in('email', studentEmails);
    }

    // 2. Create Classes
    console.log('Creating 3 classes...');
    const classesMap: Record<string, string> = {};
    for (const name of targetClassNames) {
      const { data: classObj, error: classErr } = await supabase
        .from('classes')
        .insert({ name, description: `E2E seeded course for ${name}` })
        .select()
        .single();
      
      if (classErr) throw new Error(`Failed to create class ${name}: ${classErr.message}`);
      classesMap[name] = classObj.id;
      console.log(`Created class: ${name} -> ID: ${classObj.id}`);
    }

    // 3. Create Students
    console.log('Creating 6 students...');
    const studentsMap: Array<{ id: string; name: string; email: string }> = [];
    for (const s of studentsData) {
      const { data: studObj, error: studErr } = await supabase
        .from('students')
        .insert({ name: s.name, email: s.email })
        .select()
        .single();

      if (studErr) throw new Error(`Failed to create student ${s.name}: ${studErr.message}`);
      studentsMap.push({ id: studObj.id, name: s.name, email: s.email });
      console.log(`Created student: ${s.name} -> ID: ${studObj.id}`);
    }

    // Link students to all classes
    console.log('Linking students to all classes...');
    for (const stud of studentsMap) {
      for (const className of targetClassNames) {
        const { error: linkErr } = await supabase
          .from('class_students')
          .insert({
            class_id: classesMap[className],
            student_id: stud.id
          });
        if (linkErr) throw new Error(`Failed to link student ${stud.name} to class ${className}: ${linkErr.message}`);
      }
    }

    // Rubrics designs
    const rubricsData: Record<string, Array<{ name: string; description: string; weight: number; max_score: number }>> = {
      "academic writing": [
        { name: "Thesis & Argumentation", description: "Strength and clarity of the main thesis statement and supporting arguments.", weight: 1.5, max_score: 5 },
        { name: "Structure & Organization", description: "Logical flow of paragraphs, introduction, body, and conclusion.", weight: 1.0, max_score: 5 },
        { name: "Evidence & Citations", description: "Proper integration of academic sources and accurate citation format.", weight: 1.5, max_score: 5 },
        { name: "Grammar & Style", description: "Sentence structure, grammar, vocabulary, and adherence to academic style.", weight: 1.0, max_score: 5 }
      ],
      "UROP": [
        { name: "Research Question & Objective", description: "Clarity, feasibility, and significance of the research question.", weight: 1.5, max_score: 5 },
        { name: "Methodology & Design", description: "Rigorous research design, appropriate methods, and data collection plan.", weight: 1.5, max_score: 5 },
        { name: "Preliminary Results / Analysis", description: "Quality of data analysis and depth of interpretation.", weight: 1.0, max_score: 5 },
        { name: "Presentation & Delivery", description: "Clarity of communication, figures, and formatting.", weight: 1.0, max_score: 5 }
      ],
      "Intro to Research": [
        { name: "Literature Review", description: "Comprehensive analysis of existing literature and context.", weight: 1.5, max_score: 5 },
        { name: "Research Design & Ethics", description: "Explanation of research methods and ethical considerations.", weight: 1.5, max_score: 5 },
        { name: "Critical Analysis", description: "Depth of critical thinking, evaluation of sources, and reasoning.", weight: 1.0, max_score: 5 },
        { name: "Academic Format & Bibliography", description: "Proper bibliographic layout and academic writing standards.", weight: 1.0, max_score: 5 }
      ]
    };

    // 4. Create Rubrics, Criteria, and Assignments
    const assignmentsMap: Array<{ id: string; rubric_id: string; title: string; className: string }> = [];
    const assignmentTypes = ["Midterm", "Final"];

    for (const className of targetClassNames) {
      const classId = classesMap[className];
      const criteriaTemplates = rubricsData[className];

      for (const type of assignmentTypes) {
        const title = `${type} Assignment`;
        
        // Create Rubric
        const { data: rubricObj, error: rubricErr } = await supabase
          .from('rubrics')
          .insert({
            name: `${className} - ${title} Rubric`,
            description: `Seeded rubric for ${className} ${title}`,
            class_id: classId
          })
          .select()
          .single();
        
        if (rubricErr) throw new Error(`Failed to create rubric for ${className} ${title}: ${rubricErr.message}`);

        // Create Rubric Criteria
        for (let i = 0; i < criteriaTemplates.length; i++) {
          const crit = criteriaTemplates[i];
          const { error: critErr } = await supabase
            .from('criteria')
            .insert({
              rubric_id: rubricObj.id,
              name: crit.name,
              description: crit.description,
              weight: crit.weight,
              max_score: crit.max_score,
              sort_order: i
            });
          if (critErr) throw new Error(`Failed to add criterion ${crit.name} to rubric: ${critErr.message}`);
        }

        // Create Assignment linking the rubric
        const { data: assignObj, error: assignErr } = await supabase
          .from('assignments')
          .insert({
            class_id: classId,
            title,
            description: `Seed instructions for ${className} ${title}. Submit your PDF manuscript here.`,
            rubric_id: rubricObj.id,
            submission_type: 'pdf',
            use_agentic_evaluation: false // set to false for simple/fast E2E test runs
          })
          .select()
          .single();

        if (assignErr) throw new Error(`Failed to create assignment ${title} for ${className}: ${assignErr.message}`);
        
        assignmentsMap.push({
          id: assignObj.id,
          rubric_id: rubricObj.id,
          title,
          className
        });
        console.log(`Created assignment: ${className} - ${title} -> ID: ${assignObj.id}`);
      }
    }

    // 5. Upload PDFs and Create Submissions
    console.log('Uploading PDFs and creating submissions...');
    const submissionsToEvaluate: string[] = [];

    for (const assign of assignmentsMap) {
      console.log(`Processing submissions for Assignment: ${assign.className} - ${assign.title}...`);
      
      for (let i = 0; i < studentsMap.length; i++) {
        const student = studentsMap[i];
        const pdfFile = pdfFiles[i]; //Alice -> Any-precisionLLM.pdf, Bob -> DP-LLM.pdf, etc.
        const filePath = path.join(resolvedSandboxDir!, pdfFile);
        
        const timestamp = Date.now();
        const storagePath = `${student.id}/${timestamp}-${pdfFile}`;

        // Read file as Buffer
        const fileBuffer = fs.readFileSync(filePath);

        // Upload to Storage
        const { data: storageObj, error: storageErr } = await supabase.storage
          .from('pdfs')
          .upload(storagePath, fileBuffer, {
            contentType: 'application/pdf',
            upsert: true
          });

        if (storageErr) throw new Error(`Failed to upload ${pdfFile} for student ${student.name}: ${storageErr.message}`);
        console.log(`Uploaded Storage PDF: ${storagePath} for ${student.name}`);

        // Create Submission
        const { data: submissionObj, error: subErr } = await supabase
          .from('submissions')
          .insert({
            student_id: student.id,
            class_id: classesMap[assign.className],
            assignment_id: assign.id,
            rubric_id: assign.rubric_id,
            title: `${student.name} - ${assign.title}`,
            content: '', // Will be extracted by the PDF parser worker
            pdf_path: storagePath,
            status: 'pending'
          })
          .select()
          .single();

        if (subErr) throw new Error(`Failed to create submission for ${student.name}: ${subErr.message}`);
        console.log(`Created submission row: ${submissionObj.id}`);
        submissionsToEvaluate.push(submissionObj.id);
      }
    }

    // 6. Trigger evaluations on BackEnd API
    console.log(`Triggering evaluations for ${submissionsToEvaluate.length} submissions...`);
    for (const submissionId of submissionsToEvaluate) {
      console.log(`Queuing evaluation for submission ID: ${submissionId}`);
      try {
        const res = await fetch(`${backendUrl}/evaluate`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': backendApiKey
          },
          body: JSON.stringify({
            submission_id: submissionId,
            use_agentic: false // fast/simple grading path
          })
        });

        if (res.status === 202) {
          const body = await res.json();
          console.log(`Queued job ID: ${body.job_id}`);
        } else {
          console.error(`Unexpected status from backend: ${res.status} for submission ${submissionId}`);
        }
      } catch (err: any) {
        console.error(`Connection failed for submission ${submissionId}:`, err.message);
      }
    }

    // 7. Verify inside UI using Playwright browser
    console.log('Navigating to Classes Page in FrontEnd UI to verify seeding...');
    await page.goto('/classes');
    
    // Wait for the classes heading to load
    await expect(page.getByRole('heading', { name: 'Classes' })).toBeVisible();

    // Verify all 3 classes are visible in UI
    for (const name of targetClassNames) {
      const classCard = page.locator(`div.bg-card:has-text("${name}")`);
      await expect(classCard).toBeVisible();
      console.log(`UI Verification: Class card "${name}" is visible!`);
    }

    // Click into "academic writing" class
    console.log('Navigating into academic writing class...');
    await page.locator('div.bg-card:has-text("academic writing")').first().click();

    // Verify Assignments Tab
    await page.getByRole('tab', { name: 'Assignments' }).click();
    await expect(page.locator('div.bg-card:has-text("Midterm Assignment")')).toBeVisible();
    await expect(page.locator('div.bg-card:has-text("Final Assignment")')).toBeVisible();
    console.log('UI Verification: Midterm and Final Assignments are visible in class!');

    // Click into Midterm Assignment
    await page.locator('div.bg-card:has-text("Midterm Assignment")').first().click();
    
    // Verify Submissions list
    await expect(page.getByRole('tab', { name: 'Submissions' })).toBeVisible();
    
    // Check that submissions table contains the seeded students
    for (const student of studentsMap) {
      const row = page.locator(`tr:has-text("${student.name}")`);
      await expect(row).toBeVisible();
      console.log(`UI Verification: Submission row for "${student.name}" is visible!`);
    }

    console.log('Success! Batch PDF submissions and detailed rubrics are created and verified.');
  });
});
