export type TabType = 'home' | 'courses' | 'admission' | 'verify' | 'contact' | 'admin';

export interface Course {
  id: string;
  code: string;
  title: string;
  shortTitle: string;
  category: 'diploma' | 'certification' | 'financial' | 'tech' | 'design';
  curriculum: string;
  duration: string;
  eligibility: string;
  feeRange: string;
  slots: string;
  description: string;
  bannerImg?: string;
  bannerBadge?: string;
  badge1?: string;
  badge2?: string;
  accentColor: string;
  accentBorder: string;
  icon: string;
  syllabusHighlights: string[];
}

export interface Branch {
  id: string;
  name: string;
  code: string;
  address: string;
  phone: string;
  email: string;
  status: 'Active' | 'Inactive';
  isDefault?: boolean;
  createdAt: string;
}

export interface StudentRecord {
  enrollmentId: string;
  rollNo: string;
  name: string;
  guardianName: string;
  dob?: string;
  course: string;
  courseFullName: string;
  duration: string;
  center: string;
  branchId?: string;
  branchName?: string;
  branchCode?: string;
  branchAddress?: string;
  certSerial: string;
  enrollmentDate: string;
  admissionDate?: string;
  academicSession?: string;
  status: 'Active Student' | 'Course Completed' | 'Under Examination' | 'Approved' | string;
  grade: string;
  photoUrl: string;
  verificationHash: string;
  phone?: string;
  email?: string;
  address?: string;
  gender?: string;
  fatherName?: string;
  motherName?: string;
  utrNumber?: string;
  batch?: string;
  qualification?: string;
  // Attached files for verification
  idProofUrl?: string;
  idProofName?: string;
  marksheetUrl?: string;
  marksheetName?: string;
  receiptUrl?: string;
  receiptName?: string;
}

export interface AdmissionApplication {
  id: string;
  studentName: string;
  guardianName: string;
  dob: string;
  gender: string;
  phone: string;
  email: string;
  address: string;
  course: string;
  qualification: string;
  batch: string;
  admissionDate: string;
  branchId?: string;
  branchName?: string;
  branchCode?: string;
  enrollmentId?: string;
  photoUrl?: string;
  photoName?: string;
  idProofName?: string;
  idProofUrl?: string;
  marksheetName?: string;
  marksheetUrl?: string;
  utrNumber: string;
  receiptName?: string;
  receiptUrl?: string;
  status: 'Pending Verification' | 'Approved' | 'Active';
  createdAt: string;
}
