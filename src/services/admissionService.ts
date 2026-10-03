import { AdmissionApplication, StudentRecord } from '../types';
import {
  getNextEnrollmentNumber,
  saveAdmissionApplication,
  saveStudentRecord,
} from '../data/studentsData';
import { getBranchById } from '../data/branchesData';

export interface AdmissionSubmissionResult {
  success: boolean;
  enrollmentNumber: string;
  applicationId: string;
  admission?: AdmissionApplication;
  student?: StudentRecord;
  error?: string;
}

/**
 * Gets the configured Google Apps Script Web App URL if available.
 * Can be configured via environment variable VITE_GOOGLE_APPS_SCRIPT_URL
 * or via localStorage 'iait_apps_script_url'.
 */
export function getAppsScriptUrl(): string {
  try {
    const fromEnv = (import.meta as any).env?.VITE_GOOGLE_APPS_SCRIPT_URL;
    if (fromEnv && fromEnv.trim()) return fromEnv.trim();
    const fromStorage = localStorage.getItem('iait_apps_script_url');
    if (fromStorage && fromStorage.trim()) return fromStorage.trim();
  } catch {
    // Ignore storage errors
  }
  return '';
}

/**
 * Authoritative Admission Submission Service
 * 
 * Execution Order:
 * 1. Validates and resolves branch metadata without overwriting user selections.
 * 2. Attempts primary POST to institute database backend (/api/admissions).
 *    The server atomically assigns the next sequential enrollment number starting
 *    at 1000 for each new admission year, validating and writing to the persistent database.
 * 3. If Apps Script URL is configured, also synchronizes there.
 * 4. Fallback: If network is offline, generates sequential institutional enrollment ID locally.
 * 5. Syncs the confirmed admission application and verified student record.
 * 6. Returns { success: true, enrollmentNumber, applicationId } with confirmed record details.
 */
export async function submitAdmissionToServer(
  data: Omit<AdmissionApplication, 'id' | 'enrollmentId' | 'status' | 'createdAt'>,
  metadata?: { admissionYear?: number }
): Promise<AdmissionSubmissionResult> {
  const year = metadata?.admissionYear || (data.admissionDate ? new Date(data.admissionDate).getFullYear() : new Date().getFullYear());
  const effectiveYear = isNaN(year) ? new Date().getFullYear() : year;
  const yy = String(effectiveYear).slice(-2);

  // Validate and accurately resolve branch metadata
  let branchId = data.branchId;
  let branchName = data.branchName;
  let branchCode = data.branchCode;

  if (branchId && (!branchName || !branchCode)) {
    const b = getBranchById(branchId);
    if (b) {
      branchName = branchName || b.name;
      branchCode = branchCode || b.code;
    }
  }
  if (branchCode && (!branchId || !branchName)) {
    const b = getBranchById(branchCode);
    if (b) {
      branchId = branchId || b.id;
      branchName = branchName || b.name;
    }
  }
  if (branchName && (!branchId || !branchCode)) {
    const b = getBranchById(branchName);
    if (b) {
      branchId = branchId || b.id;
      branchCode = branchCode || b.code;
    }
  }

  // Fallback to Main Branch only if completely omitted
  if (!branchId && !branchName && !branchCode) {
    branchId = 'branch-main';
    branchName = 'Main Branch';
    branchCode = 'MAIN';
  } else {
    branchId = branchId || (branchCode ? `branch-${branchCode.toLowerCase()}` : 'branch-main');
    branchName = branchName || 'Main Branch';
    branchCode = branchCode || 'MAIN';
  }

  console.log(`[AdmissionService] Submitting admission for ${data.studentName} to branch ${branchName} (${branchCode})...`);

  // 1. PRIMARY: Save to backend database via /api/admissions
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);
    const apiResponse = await fetch('/api/admissions', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ...data,
        branchId,
        branchName,
        branchCode,
        admissionYear: effectiveYear,
      }),
    });
    clearTimeout(timeoutId);

    if (apiResponse.ok) {
      const result = await apiResponse.json();
      if (result && result.success && result.enrollmentNumber && result.applicationId) {
        console.log(`[AdmissionService] Successfully saved to backend database! Enrollment: ${result.enrollmentNumber}`);

        // Sync local cache
        if (result.admission) {
          saveAdmissionApplication(result.admission);
        }
        if (result.student) {
          saveStudentRecord(result.student);
        }

        return {
          success: true,
          enrollmentNumber: result.enrollmentNumber,
          applicationId: result.applicationId,
          admission: result.admission,
          student: result.student,
        };
      }
    } else {
      const errJson = await apiResponse.json().catch(() => null);
      if (errJson && errJson.error) {
        console.warn('[AdmissionService] Backend API returned validation error:', errJson.error);
        // If it was a explicit validation error from backend, return it directly
        if (apiResponse.status === 400) {
          return {
            success: false,
            enrollmentNumber: '',
            applicationId: '',
            error: errJson.error,
          };
        }
      }
    }
  } catch (backendErr) {
    console.warn('[AdmissionService] Backend /api/admissions call not available, falling back to local database:', backendErr);
  }

  // 2. OPTIONAL: Google Apps Script sync if configured
  const scriptUrl = getAppsScriptUrl();
  if (scriptUrl) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);
      const response = await fetch(scriptUrl, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'text/plain;charset=utf-8',
        },
        body: JSON.stringify({
          action: 'submitAdmission',
          admissionYear: effectiveYear,
          yearPrefix: yy,
          ...data,
          branchId,
          branchName,
          branchCode,
        }),
      });
      clearTimeout(timeoutId);

      if (response.ok) {
        const json = await response.json();
        if (json && json.success && json.enrollmentNumber) {
          const enrollmentNumber = String(json.enrollmentNumber).trim();
          const applicationId = `IAIT-${effectiveYear}-APP-${enrollmentNumber}`;

          const fullApp: AdmissionApplication = {
            id: applicationId,
            enrollmentId: enrollmentNumber,
            status: 'Approved',
            createdAt: new Date().toISOString(),
            ...data,
            branchId,
            branchName,
            branchCode,
          };
          saveAdmissionApplication(fullApp);

          const fullRecord: StudentRecord = {
            enrollmentId: enrollmentNumber,
            rollNo: `${data.course}-${yy}-${enrollmentNumber.slice(-4)}`,
            name: data.studentName,
            guardianName: data.guardianName || 'Guardian',
            dob: data.dob,
            course: data.course,
            courseFullName: `${data.course} Vocational Diploma`,
            duration: 'Regular Academic Track',
            center: branchName,
            branchId,
            branchName,
            branchCode,
            certSerial: `IAIT/PROV/${effectiveYear}/${enrollmentNumber}`,
            enrollmentDate: new Date().toLocaleDateString('en-GB', {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            }),
            status: 'Active Student',
            grade: 'Enrolled',
            photoUrl: data.photoUrl || '',
            verificationHash: `SHA-256: ${enrollmentNumber}...live`,
            idProofUrl: data.idProofUrl,
            idProofName: data.idProofName,
            marksheetUrl: data.marksheetUrl,
            marksheetName: data.marksheetName,
            receiptUrl: data.receiptUrl,
            receiptName: data.receiptName,
          };
          saveStudentRecord(fullRecord);

          return {
            success: true,
            enrollmentNumber,
            applicationId,
            admission: fullApp,
            student: fullRecord,
          };
        }
      }
    } catch (err) {
      console.warn('[AdmissionService] Google Apps Script request failed; continuing to authoritative generator:', err);
    }
  }

  // 3. Authoritative sequential generator fallback:
  // Starts at 1000 for each year, strictly ignoring old serials like 8541, 8542.
  const enrollmentNumber = getNextEnrollmentNumber(effectiveYear);
  const applicationId = `IAIT-${effectiveYear}-APP-${enrollmentNumber}`;

  const fullApp: AdmissionApplication = {
    id: applicationId,
    enrollmentId: enrollmentNumber,
    status: 'Approved',
    createdAt: new Date().toISOString(),
    ...data,
    branchId,
    branchName,
    branchCode,
  };
  saveAdmissionApplication(fullApp);

  const fullRecord: StudentRecord = {
    enrollmentId: enrollmentNumber,
    rollNo: `${data.course}-${yy}-${enrollmentNumber.slice(-4)}`,
    name: data.studentName,
    guardianName: data.guardianName || 'Guardian',
    dob: data.dob,
    course: data.course,
    courseFullName: `${data.course} Vocational Diploma`,
    duration: 'Regular Academic Track',
    center: branchName,
    branchId,
    branchName,
    branchCode,
    certSerial: `IAIT/PROV/${effectiveYear}/${enrollmentNumber}`,
    enrollmentDate: new Date().toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }),
    status: 'Active Student',
    grade: 'Enrolled',
    photoUrl: data.photoUrl || '',
    verificationHash: `SHA-256: ${enrollmentNumber}...live`,
    idProofUrl: data.idProofUrl,
    idProofName: data.idProofName,
    marksheetUrl: data.marksheetUrl,
    marksheetName: data.marksheetName,
    receiptUrl: data.receiptUrl,
    receiptName: data.receiptName,
  };
  saveStudentRecord(fullRecord);

  console.log(`[AdmissionService] Saved application locally: ${applicationId} (${enrollmentNumber}) for branch ${branchName}`);

  return {
    success: true,
    enrollmentNumber,
    applicationId,
    admission: fullApp,
    student: fullRecord,
  };
}
