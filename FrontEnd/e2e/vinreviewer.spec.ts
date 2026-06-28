import { test, expect } from '@playwright/test';

test.describe('GradioAI End-to-End System Test', () => {
  const timestamp = Math.floor(Date.now() / 1000);
  const className = `E2E Class - ${timestamp}`;
  const studentName = `E2E Student - ${timestamp}`;
  const studentEmail = `e2e-${timestamp}@student.com`;
  const assignmentTitle = `E2E Assignment - ${timestamp}`;
  const criterionName = 'Content Clarity';
  const essayContent = `Climate change represents one of the most significant challenges facing coastal ecosystems today. Rising sea levels threaten habitats that support diverse marine and terrestrial species. Content Clarity is highly evident in our structured arguments. The essay shows that longitudinal studies between 2010 and 2023 validate these negative impacts. We argue that local conservation acts as a buffer.`;

  test('should execute the entire grading lifecycle from class creation to approval and analytics', async ({ page }) => {
    page.on('console', msg => console.log('BROWSER LOG:', msg.type(), msg.text()));
    page.on('pageerror', err => console.error('BROWSER ERROR:', err.message));
    page.on('response', response => {
      if (response.url().includes('/functions/v1/')) {
        response.text().then(text => {
          console.log(`HTTP ${response.status()} ${response.url()}:`, text);
        }).catch(err => { });
      }
    });

    await page.route('**/functions/v1/evaluate', async route => {
      const requestBody = route.request().postDataJSON();
      const submissionId = requestBody?.submission_id;
      if (!submissionId) {
        await route.fallback();
        return;
      }

      console.log(`[E2E Intercept] Intercepted evaluate for submission ${submissionId}`);

      // Make direct request to local backend
      const apiContext = page.request;
      const queueResponse = await apiContext.post('http://localhost:8000/evaluate', {
        headers: {
          'X-API-Key': 'change-me-in-production',
          'Content-Type': 'application/json'
        },
        data: {
          submission_id: submissionId
        }
      });

      if (!queueResponse.ok()) {
        const errText = await queueResponse.text();
        console.error(`[E2E Intercept] Failed to queue job:`, errText);
        await route.abort();
        return;
      }

      const queueData = await queueResponse.json();
      const jobId = queueData.job_id;
      console.log(`[E2E Intercept] Job queued with ID ${jobId}`);

      // Poll job status until completed
      let evaluationId = null;
      for (let i = 0; i < 80; i++) {
        await new Promise(resolve => setTimeout(resolve, 2000));

        const jobResponse = await apiContext.get(`http://localhost:8000/jobs/${jobId}`, {
          headers: {
            'X-API-Key': 'change-me-in-production'
          }
        });

        if (jobResponse.ok()) {
          const jobData = await jobResponse.json();
          console.log(`[E2E Intercept] Job status: ${jobData.status}`);
          if (jobData.status === 'completed') {
            evaluationId = jobData.evaluation_id;
            break;
          } else if (jobData.status === 'failed') {
            console.error(`[E2E Intercept] Job failed:`, jobData.error);
            break;
          }
        }
      }

      if (evaluationId) {
        console.log(`[E2E Intercept] Job completed. Returning evaluation ${evaluationId}`);
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            evaluation_id: evaluationId,
            status: 'ai_graded',
            needs_review: false,
            min_confidence: 85,
            avg_confidence: 90
          })
        });
      } else {
        console.error(`[E2E Intercept] Job polling timed out or failed.`);
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Job execution timed out or failed' })
        });
      }
    });

    // 1. Navigate to classes page
    await page.goto('/classes');
    await expect(page.getByRole('heading', { name: 'Classes' })).toBeVisible();

    // 2. Create a new Class
    await page.getByRole('button', { name: 'New Class' }).click();
    await expect(page.getByRole('heading', { name: 'Create Class' })).toBeVisible();
    await page.getByPlaceholder('e.g. COMP1010').fill(className);
    await page.getByPlaceholder('Optional description').fill('E2E Test Class Description');
    await page.getByRole('button', { name: 'Create Class' }).click();

    // Verify class card is visible in the list and click it
    const classCard = page.locator(`div.bg-card:has-text("${className}")`);
    await expect(classCard).toBeVisible();
    await classCard.click();

    // 3. Navigate to Students tab and enroll a student
    await page.getByRole('tab', { name: 'Students' }).click();
    await page.getByRole('button', { name: 'Add Student' }).click();
    await page.getByPlaceholder('Student name').fill(studentName);
    await page.getByPlaceholder('student@email.com').fill(studentEmail);
    await page.getByRole('button', { name: 'Add Student', exact: true }).click();
    await expect(page.getByText(studentName, { exact: true })).toBeVisible();

    // 4. Navigate to Assignments tab and create a new Assignment
    await page.getByRole('tab', { name: 'Assignments' }).click();
    await page.getByRole('button', { name: 'New Assignment' }).click();
    await page.getByPlaceholder('e.g. Progress Report 1').fill(assignmentTitle);
    await page.getByPlaceholder('Assignment instructions...').fill('E2E Test Assignment Description');
    await page.getByRole('button', { name: 'Create Assignment' }).click();

    // Verify assignment card is visible and click it
    const assignmentCard = page.locator(`div.bg-card:has-text("${assignmentTitle}")`);
    await expect(assignmentCard).toBeVisible();
    await assignmentCard.click();

    // 5. Navigate to Rubric tab and create criteria
    await page.getByRole('tab', { name: 'Rubric' }).click();
    await page.getByRole('button', { name: 'Create Rubric' }).click();
    await page.getByPlaceholder('e.g. Clarity & Focus').fill(criterionName);
    await page.getByPlaceholder('Description (optional)').fill('Quality and clarity of essay content');

    // Set weight and max score
    await page.locator('input[type="number"]').first().fill('1');
    await page.locator('input[type="number"]').nth(1).fill('5');
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(page.getByText(criterionName, { exact: true })).toBeVisible();

    // 6. Navigate back to Submissions tab and upload an essay
    await page.getByRole('tab', { name: 'Submissions' }).click();
    await page.getByRole('button', { name: 'Add Submission' }).click();

    // Select the student from Radix Select
    await page.getByRole('combobox').click();
    await page.getByRole('option', { name: studentName }).click();

    // Fill in text content and submit
    await page.getByPlaceholder("Paste the student's submission text...").fill(essayContent);
    await page.getByRole('button', { name: 'Submit', exact: true }).click();

    // Click back to return to the submissions list table
    await page.getByRole('button', { name: 'Back' }).click();

    // Verify submission is queued in the table
    const submissionRow = page.locator(`tr:has-text("${studentName}")`);
    await expect(submissionRow).toBeVisible();
    await expect(submissionRow.getByText('pending')).toBeVisible();

    // 7. Trigger AI evaluation (Simple Evaluation Mode)
    await submissionRow.getByRole('button', { name: 'Evaluate' }).click();

    // Wait for the status to transition to ai_graded or needs_review
    await expect(submissionRow.locator('button:has-text("Review")')).toBeVisible({ timeout: 150000 });

    // 8. Go to the review panel (SubmissionDetail)
    await submissionRow.getByRole('button', { name: 'Review' }).click();
    await expect(page.getByText('Rubric Breakdown')).toBeVisible();
    await expect(page.getByText(criterionName, { exact: true })).toBeVisible();

    // Verify AI score and evidence citation are populated
    await expect(page.getByText('Evidence verified')).toBeVisible();

    // 9. Override the AI score as the Instructor
    const criterionCard = page.locator('div').filter({ has: page.locator('p', { hasText: criterionName }) }).first();
    await criterionCard.getByLabel(`Edit score for ${criterionName}`).click();
    await criterionCard.locator('input[type="number"]').fill('4');
    await criterionCard.getByLabel('Save score').click();

    // Verify overridden badge/score shows up
    await expect(page.getByText('You overrode AI')).toBeVisible();

    // 10. Approve the final grade
    await page.getByLabel('Approve evaluation').click();
    await expect(page.getByText('Approved')).toBeVisible();

    // 11. Go back and check analytics
    await page.getByRole('button', { name: 'Back' }).click();
    await page.getByRole('tab', { name: 'Analytics' }).click();
    await expect(page.getByText('Score Distribution')).toBeVisible();

    // 12. Cleanup: Navigate back to classes list and delete the E2E class
    await page.goto('/classes');
    const cleanClassCard = page.locator(`div.bg-card:has-text("${className}")`);
    await expect(cleanClassCard).toBeVisible();

    // Hover and click delete button
    await cleanClassCard.hover();
    await cleanClassCard.getByLabel('Delete class').click();

    // Verify it is removed
    await expect(cleanClassCard).not.toBeVisible();
  });
});
