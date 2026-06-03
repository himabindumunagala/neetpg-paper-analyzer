import React, { useState, useEffect, useRef } from 'react';

function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  
  // App States
  const [uploadHistory, setUploadHistory] = useState([]);
  const [questions, setQuestions] = useState([]);
  const [totalQuestions, setTotalQuestions] = useState(0);
  const [selectedQuestion, setSelectedQuestion] = useState(null);
  const [modalQuestionsList, setModalQuestionsList] = useState([]);
  const [stats, setStats] = useState({
    totalQuestions: 0,
    subjects: [],
    chapters: [],
    imageCount: 0,
    confidenceStats: []
  });
  const [logs, setLogs] = useState([]);
  
  // Interaction States
  const [isUploading, setIsUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  
  // Filter States
  const [subjectFilter, setSubjectFilter] = useState('All');
  const [difficultyFilter, setDifficultyFilter] = useState('All');
  const [yearFilter, setYearFilter] = useState('All');
  const [uploadFilter, setUploadFilter] = useState('All');
  const [imageFilter, setImageFilter] = useState('All');
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(25);
  const [layoutMode, setLayoutMode] = useState('grid'); // 'grid' (original cards) or 'table' (compact list)
  const [zoomedImage, setZoomedImage] = useState(null);
  
  // Trend YoY Matrix Analytics States
  const [trendsMatrix, setTrendsMatrix] = useState(null);
  const [trendsLoading, setTrendsLoading] = useState(false);
  const [trendsViewMode, setTrendsViewMode] = useState('matrix'); // 'matrix' or 'flat'
  
  // Student specific states
  const [studentTab, setStudentTab] = useState('dashboard');
  const [quizSettings, setQuizSettings] = useState({ subject: 'All', year: 'All', limit: 10, imagesOnly: false });
  const [quizQuestions, setQuizQuestions] = useState([]);
  const [currentQuizIdx, setCurrentQuizIdx] = useState(0);
  const [quizSelectedAnswers, setQuizSelectedAnswers] = useState({});
  const [isQuizActive, setIsQuizActive] = useState(false);
  const [isQuizCompleted, setIsQuizCompleted] = useState(false);
  const [quizScore, setQuizScore] = useState(0);

  // Exam Simulator States
  const [isExamActive, setIsExamActive] = useState(false);
  const [isExamCompleted, setIsExamCompleted] = useState(false);
  const [examQuestions, setExamQuestions] = useState([]);
  const [examImagesOnly, setExamImagesOnly] = useState(false);
  const [currentExamIdx, setCurrentExamIdx] = useState(0);
  const [examSelectedAnswers, setExamSelectedAnswers] = useState({});
  const [examStatus, setExamStatus] = useState({}); // 'unvisited', 'answered', 'marked', 'answered_marked'
  const [examTimeRemaining, setExamTimeRemaining] = useState(12600); // 3h 30m = 12600s
  const [examLoading, setExamLoading] = useState(false);

  // Student Progress tracking states
  const [studentProgressList, setStudentProgressList] = useState([]);
  const [progressLoading, setProgressLoading] = useState(false);
 
  // Settings Configuration States
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [geminiKeyExists, setGeminiKeyExists] = useState(false);
  const [geminiKeyInput, setGeminiKeyInput] = useState('');
  const [isSavingKey, setIsSavingKey] = useState(false);
  const [keyLoadError, setKeyLoadError] = useState('');
  
  // Authentication & Google User States
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authChecking, setAuthChecking] = useState(true);
  const [userProfile, setUserProfile] = useState(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const fileInputRef = useRef(null);
  const logsEndRef = useRef(null);

  // 1. Authenticate check on mount
  useEffect(() => {
    const savedUser = localStorage.getItem('neetpg_user_profile');
    if (savedUser) {
      try {
        const profile = JSON.parse(savedUser);
        setUserProfile(profile);
        setIsAuthenticated(true);
      } catch (e) {
        localStorage.removeItem('neetpg_user_profile');
      }
    }
    setAuthChecking(false);
  }, []);

  // Handle Google Login Credential Callback
  const handleGoogleLoginCallback = async (response) => {
    try {
      const res = await fetch('/api/auth/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: response.credential })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        localStorage.setItem('neetpg_user_profile', JSON.stringify(data.user));
        setUserProfile(data.user);
        setIsAuthenticated(true);
        setAuthError('');
      } else {
        setAuthError(data.error || 'Google Authentication failed.');
      }
    } catch (err) {
      setAuthError('Failed to connect to authentication server.');
    }
  };

  // Handle Logout
  const handleLogout = () => {
    localStorage.removeItem('neetpg_user_profile');
    setUserProfile(null);
    setIsAuthenticated(false);
  };

  // Initialize Google Sign-In SDK
  useEffect(() => {
    if (isAuthenticated || authChecking) return;

    let checkGoogleInterval;
    const initGoogleSignIn = () => {
      if (window.google && window.google.accounts) {
        clearInterval(checkGoogleInterval);
        
        fetch('/api/auth/google/client-id')
          .then(res => res.json())
          .then(data => {
            if (!data.clientId) {
              setAuthError('Google Client ID is missing. Please configure GOOGLE_CLIENT_ID environment variable.');
              return;
            }
            
            window.google.accounts.id.initialize({
              client_id: data.clientId,
              callback: handleGoogleLoginCallback
            });

            const parentDiv = document.getElementById('google-login-btn-parent');
            if (parentDiv) {
              window.google.accounts.id.renderButton(
                parentDiv,
                { theme: 'outline', size: 'large', width: '320' }
               );
            }
          })
          .catch(err => {
            console.error('Failed to load Google Client ID:', err);
            setAuthError('Network error: Could not fetch Google client configurations.');
          });
      }
    };

    checkGoogleInterval = setInterval(initGoogleSignIn, 300);
    return () => clearInterval(checkGoogleInterval);
  }, [isAuthenticated, authChecking]);

  // Initialize static dashboard stats on mount
  useEffect(() => {
    if (!isAuthenticated) return;
    fetchHistory();
    fetchQuestions();
    fetchSummaryStats();
    fetchSystemLogs();
    if (userProfile && userProfile.role === 'Student') {
      fetchStudentProgress();
    }
  }, [isAuthenticated, userProfile]);

  // Active status polling loop: only triggers when there is a PENDING or PROCESSING file in the queue
  useEffect(() => {
    if (!isAuthenticated) return;

    const hasActiveJob = uploadHistory.some(
      job => job.Processing_Status === 'PENDING' || job.Processing_Status === 'PROCESSING'
    );

    if (!hasActiveJob) return;

    // Poll queue status, logs, and summary statistics every 3 seconds for active feedback
    const interval = setInterval(() => {
      fetchHistory();
      fetchSystemLogs();
      fetchSummaryStats();
    }, 3000);

    return () => clearInterval(interval);
  }, [isAuthenticated, uploadHistory]);
  // Handle SPA Hash Routing
  useEffect(() => {
    if (!isAuthenticated) return;
    const handleHashChange = () => {
      const hash = window.location.hash;
      const isStudent = userProfile && userProfile.role === 'Student';
      
      if (isStudent) {
        if (hash === '#/dashboard') {
          setStudentTab('dashboard');
        } else if (hash === '#/practice') {
          setStudentTab('practice');
        } else if (hash === '#/exam') {
          setStudentTab('exam');
        } else if (hash === '#/question-bank') {
          setStudentTab('questions');
        } else if (hash === '#/trends') {
          setStudentTab('trends');
        } else if (hash === '#/progress') {
          setStudentTab('progress');
        } else {
          window.location.hash = '#/dashboard';
          setStudentTab('dashboard');
        }
      } else {
        if (hash === '#/dashboard') {
          setActiveTab('dashboard');
        } else if (hash === '#/question-bank') {
          setActiveTab('questions');
        } else if (hash === '#/trends') {
          setActiveTab('analytics');
        } else if (hash === '#/console') {
          setActiveTab('settings');
        } else {
          window.location.hash = '#/dashboard';
          setActiveTab('dashboard');
        }
      }
      setMobileMenuOpen(false);
    };

    handleHashChange();
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [isAuthenticated, userProfile]);

  // Fetch trends when analytics tab becomes active
  useEffect(() => {
    if (!isAuthenticated) return;
    const isStudent = userProfile && userProfile.role === 'Student';
    if ((!isStudent && activeTab === 'analytics') || (isStudent && studentTab === 'trends')) {
      fetchTrendsMatrix();
    }
  }, [activeTab, studentTab, isAuthenticated, userProfile]);

  // Re-fetch questions when filters or active tab changes (Auto-Refresh)
  useEffect(() => {
    if (!isAuthenticated) return;
    const isStudent = userProfile && userProfile.role === 'Student';
    if ((!isStudent && activeTab === 'questions') || (isStudent && studentTab === 'questions')) {
      fetchQuestions();
    }
  }, [activeTab, studentTab, subjectFilter, difficultyFilter, yearFilter, uploadFilter, imageFilter, searchTerm, page, itemsPerPage, isAuthenticated, userProfile]);

  // Scroll logs console to bottom
  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  const generateExam = async () => {
    setExamLoading(true);
    try {
      const url = examImagesOnly ? '/api/exam/generate?hasImage=true' : '/api/exam/generate';
      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        if (data.questions && data.questions.length > 0) {
          const processedQuestions = data.questions.map(q => {
            const keys = [];
            if (q.Option_A !== undefined && q.Option_A !== '') keys.push('A');
            if (q.Option_B !== undefined && q.Option_B !== '') keys.push('B');
            if (q.Option_C !== undefined && q.Option_C !== '') keys.push('C');
            if (q.Option_D !== undefined && q.Option_D !== '') keys.push('D');
            const shuffledKeys = keys.sort(() => 0.5 - Math.random());
            return { ...q, _shuffledOptionKeys: shuffledKeys };
          });
          setExamQuestions(processedQuestions);
          setCurrentExamIdx(0);
          setExamSelectedAnswers({});
          
          const initialStatus = {};
          processedQuestions.forEach(q => {
            initialStatus[q.Question_ID] = 'unvisited';
          });
          setExamStatus(initialStatus);
          
          setExamTimeRemaining(12600); // 3 hours 30 mins
          setIsExamActive(true);
          setIsExamCompleted(false);
        } else {
          alert('Failed to generate exam questions. Database might be empty.');
        }
      } else {
        const err = await response.json();
        alert(err.error || 'Failed to generate exam.');
      }
    } catch (err) {
      console.error('Failed to generate exam:', err);
      alert('Network error connecting to exam generator.');
    } finally {
      setExamLoading(false);
    }
  };

  const submitExam = () => {
    setIsExamActive(false);
    setIsExamCompleted(true);

    let correctCount = 0;
    let incorrectCount = 0;
    let omittedCount = 0;
    const subjectBreakdown = {};

    examQuestions.forEach(q => {
      const selected = examSelectedAnswers[q.Question_ID];
      const status = examStatus[q.Question_ID];
      const isEvaluated = selected !== undefined && (status === 'answered' || status === 'answered_marked_for_review');
      
      if (!subjectBreakdown[q.Subject]) {
        subjectBreakdown[q.Subject] = { total: 0, correct: 0, score: 0 };
      }
      subjectBreakdown[q.Subject].total += 1;

      if (isEvaluated) {
        if (selected === q.Correct_Answer) {
          correctCount += 1;
          subjectBreakdown[q.Subject].correct += 1;
          subjectBreakdown[q.Subject].score += 4;
        } else {
          incorrectCount += 1;
          subjectBreakdown[q.Subject].score -= 1;
        }
      } else {
        omittedCount += 1;
      }
    });

    const finalMarks = (correctCount * 4) - (incorrectCount * 1);
    const maxMarks = examQuestions.length * 4;
    const durationSec = 12600 - examTimeRemaining;

    saveStudentProgress({
      sessionType: 'exam',
      score: finalMarks,
      maxScore: maxMarks,
      correctCount,
      incorrectCount,
      omittedCount,
      durationSeconds: durationSec,
      subjectBreakdown
    });
  };

  const submitQuiz = () => {
    setIsQuizCompleted(true);
    setIsQuizActive(false);

    let correctCount = quizScore;
    let incorrectCount = Object.keys(quizSelectedAnswers).length - quizScore;
    let omittedCount = quizQuestions.length - Object.keys(quizSelectedAnswers).length;
    
    const subjectBreakdown = {};
    quizQuestions.forEach((q, idx) => {
      const selected = quizSelectedAnswers[idx];
      if (!subjectBreakdown[q.Subject]) {
        subjectBreakdown[q.Subject] = { total: 0, correct: 0, score: 0 };
      }
      subjectBreakdown[q.Subject].total += 1;
      
      if (selected !== undefined) {
        if (selected === q.Correct_Answer) {
          subjectBreakdown[q.Subject].correct += 1;
          subjectBreakdown[q.Subject].score += 4;
        } else {
          subjectBreakdown[q.Subject].score -= 1;
        }
      }
    });

    const finalQuizScore = (correctCount * 4) - (incorrectCount * 1);
    const maxQuizMarks = quizQuestions.length * 4;

    saveStudentProgress({
      sessionType: 'practice',
      score: finalQuizScore,
      maxScore: maxQuizMarks,
      correctCount,
      incorrectCount,
      omittedCount,
      durationSeconds: 0,
      subjectBreakdown
    });
  };

  useEffect(() => {
    if (!isExamActive) return;
    const timer = setInterval(() => {
      setExamTimeRemaining(time => {
        if (time <= 1) {
          clearInterval(timer);
          submitExam();
          return 0;
        }
        return time - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [isExamActive]);

  const handleExamOptionClick = (option) => {
    const q = examQuestions[currentExamIdx];
    const updatedAnswers = { ...examSelectedAnswers, [q.Question_ID]: option };
    setExamSelectedAnswers(updatedAnswers);
    
    const currentStatus = examStatus[q.Question_ID];
    const newStatus = (currentStatus === 'marked_for_review' || currentStatus === 'answered_marked_for_review')
      ? 'answered_marked_for_review'
      : 'answered';
    setExamStatus({ ...examStatus, [q.Question_ID]: newStatus });
  };

  const handleClearExamResponse = () => {
    const q = examQuestions[currentExamIdx];
    const updatedAnswers = { ...examSelectedAnswers };
    delete updatedAnswers[q.Question_ID];
    setExamSelectedAnswers(updatedAnswers);
    
    const currentStatus = examStatus[q.Question_ID];
    const newStatus = (currentStatus === 'answered_marked_for_review' || currentStatus === 'marked_for_review')
      ? 'marked_for_review'
      : 'unvisited';
    setExamStatus({ ...examStatus, [q.Question_ID]: newStatus });
  };

  const handleMarkForReview = () => {
    const q = examQuestions[currentExamIdx];
    const hasAnswer = examSelectedAnswers[q.Question_ID] !== undefined;
    const newStatus = hasAnswer ? 'answered_marked_for_review' : 'marked_for_review';
    setExamStatus({ ...examStatus, [q.Question_ID]: newStatus });
    
    if (currentExamIdx < examQuestions.length - 1) {
      setCurrentExamIdx(idx => idx + 1);
    }
  };

  const handleSaveAndNext = () => {
    const q = examQuestions[currentExamIdx];
    const hasAnswer = examSelectedAnswers[q.Question_ID] !== undefined;
    const newStatus = hasAnswer ? 'answered' : 'unanswered';
    setExamStatus({ ...examStatus, [q.Question_ID]: newStatus });
    
    if (currentExamIdx < examQuestions.length - 1) {
      setCurrentExamIdx(idx => idx + 1);
    }
  };

  const handleSavePasscode = async (e) => {
    e.preventDefault();
    setPasscodeSuccessMsg('');
    setPasscodeErrorMsg('');
    try {
      const response = await fetch('/api/settings/admin_password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: currentPasscode, newPassword: newPasscode })
      });
      const data = await response.json();
      if (response.ok && data.success) {
        setPasscodeSuccessMsg('Passcode successfully updated!');
        setCurrentPasscode('');
        setNewPasscode('');
      } else {
        setPasscodeErrorMsg(data.error || 'Failed to update passcode.');
      }
    } catch (err) {
      setPasscodeErrorMsg('Network error: Could not connect to update passcode.');
    }
  };

  // ==========================================
  // API FETCH CALLS
  // ==========================================

  const fetchHistory = async () => {
    try {
      const response = await fetch('/api/processingStatus');
      if (response.ok) {
        const data = await response.json();
        setUploadHistory(data);
      }
    } catch (err) {
      console.error('Failed to load processing history:', err);
    }
  };

  const fetchQuestions = async () => {
    try {
      const offset = (page - 1) * itemsPerPage;
      let url = `/api/questions?limit=${itemsPerPage}&offset=${offset}`;
      
      if (subjectFilter !== 'All') url += `&subject=${encodeURIComponent(subjectFilter)}`;
      if (difficultyFilter !== 'All') url += `&difficulty=${encodeURIComponent(difficultyFilter)}`;
      if (yearFilter !== 'All') url += `&year=${encodeURIComponent(yearFilter)}`;
      if (uploadFilter !== 'All') url += `&uploadId=${encodeURIComponent(uploadFilter)}`;
      if (imageFilter !== 'All') url += `&hasImage=${encodeURIComponent(imageFilter === 'Yes' ? 'true' : 'false')}`;
      if (searchTerm) url += `&search=${encodeURIComponent(searchTerm)}`;
      
      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        setQuestions(data.questions);
        setTotalQuestions(data.totalCount);
      }
    } catch (err) {
      console.error('Failed to load questions:', err);
    }
  };

  const fetchSummaryStats = async () => {
    try {
      const response = await fetch('/api/summary');
      if (response.ok) {
        const data = await response.json();
        setStats(data);
      }
    } catch (err) {
      console.error('Failed to load summary stats:', err);
    }
  };

  const fetchStudentProgress = async () => {
    if (!userProfile) return;
    setProgressLoading(true);
    try {
      const response = await fetch('/api/student/progress', {
        headers: {
          'x-user-email': userProfile.email
        }
      });
      if (response.ok) {
        const data = await response.json();
        setStudentProgressList(data.records || []);
      }
    } catch (err) {
      console.error('Failed to load student progress:', err);
    } finally {
      setProgressLoading(false);
    }
  };

  const saveStudentProgress = async (progressData) => {
    if (!userProfile) return;
    try {
      await fetch('/api/student/progress', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-email': userProfile.email
        },
        body: JSON.stringify(progressData)
      });
      fetchStudentProgress();
    } catch (err) {
      console.error('Failed to save student progress:', err);
    }
  };

  const fetchTrendsMatrix = async () => {
    setTrendsLoading(true);
    try {
      const response = await fetch('/api/trends/subject-matrix');
      if (response.ok) {
        const data = await response.json();
        setTrendsMatrix(data);
      }
    } catch (err) {
      console.error('Failed to load trends subject matrix:', err);
    } finally {
      setTrendsLoading(false);
    }
  };

  const fetchSystemLogs = async () => {
    try {
      const response = await fetch('/api/logs');
      if (response.ok) {
        const data = await response.json();
        setLogs(data.logs || []);
      }
    } catch (err) {
      console.error('Failed to load execution logs:', err);
    }
  };

  const deleteQuestion = async (id, e) => {
    if (e) e.stopPropagation(); // Avoid triggering card details modal!
    if (!window.confirm('Are you sure you want to permanently delete this question? This action is irreversible.')) return;
    
    try {
      const response = await fetch(`/api/question/${id}`, { method: 'DELETE' });
      if (response.ok) {
        fetchQuestions();
        fetchSummaryStats();
        if (selectedQuestion && selectedQuestion.Question_ID === id) {
          setSelectedQuestion(null);
        }
      } else {
        const err = await response.json();
        alert(err.error || 'Failed to delete question.');
      }
    } catch (err) {
      console.error('Failed to delete question:', err);
    }
  };

  const deleteUpload = async (id, e) => {
    if (e) e.stopPropagation();
    if (!window.confirm('Are you sure you want to permanently delete this upload package? This will delete the physical PDF file along with ALL extracted questions and associated visual diagrams!')) return;
    
    try {
      const response = await fetch(`/api/upload/${id}`, { method: 'DELETE' });
      if (response.ok) {
        fetchHistory();
        fetchQuestions();
        fetchSummaryStats();
      } else {
        const err = await response.json();
        alert(err.error || 'Failed to delete upload record.');
      }
    } catch (err) {
      console.error('Failed to delete upload record:', err);
    }
  };

  // ==========================================
  // INTERACTIVE EVENT HANDLERS
  // ==========================================

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFilesUpload(e.dataTransfer.files);
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      handleFilesUpload(e.target.files);
    }
  };

  const handleFilesUpload = async (filesList) => {
    const files = Array.from(filesList);
    
    // Validations: Limit formats to PDF only
    const nonPdfs = files.filter(f => !f.name.toLowerCase().endsWith('.pdf'));
    if (nonPdfs.length > 0) {
      alert('Validation Failure: Supported format is PDF only!');
      return;
    }
    
    // Validations: Check sizes
    const oversized = files.filter(f => f.size > 1024 * 1024 * 1024); // 1GB limit
    if (oversized.length > 0) {
      alert('Validation Failure: Maximum file size limit is 1GB!');
      return;
    }

    setIsUploading(true);
    setUploadProgress(20);
    
    const formData = new FormData();
    files.forEach(file => {
      formData.append('pdfFiles', file);
    });

    try {
      setUploadProgress(50);
      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData
      });
      
      setUploadProgress(85);
      const data = await response.json();
      
      if (response.ok && data.success) {
        setUploadProgress(100);
        // Automatically trigger parsing queue for all uploaded files
        for (const up of data.uploads) {
          await triggerFileProcessing(up.uploadId);
        }
        fetchHistory();
        fetchQuestions();
        fetchSummaryStats();
      } else {
        alert(data.error || 'Failed to complete upload.');
      }
    } catch (err) {
      console.error('Network boundary failed:', err);
      alert('Failed to connect to backend server.');
    } finally {
      setTimeout(() => {
        setIsUploading(false);
        setUploadProgress(0);
      }, 800);
    }
  };

  const triggerFileProcessing = async (uploadId) => {
    try {
      const resp = await fetch('/api/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uploadId })
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        alert(err.error || 'Failed to trigger processing.');
        return;
      }
      // Immediately refresh the history so PROCESSING status shows
      fetchHistory();
    } catch (err) {
      console.error('Trigger request crashed:', err);
      alert('Could not connect to backend server.');
    }
  };


  const triggerBatchEnrichment = async () => {
    try {
      const resp = await fetch('/api/enrichPending', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        alert(err.error || 'Failed to trigger batch enrichment.');
        return;
      }
      alert('Batch enrichment started! Check the server logs, and refresh this page in a few minutes to see updated explanations.');
    } catch (err) {
      console.error('Trigger request crashed:', err);
      alert('Could not connect to backend server.');
    }
  };

  const triggerExcelDownload = (uploadId = '') => {
    let url = '/api/downloadExcel';
    if (uploadId) url += `?uploadId=${uploadId}`;
    window.location.href = url;
  };

  const renderOptionText = (optText) => {
    if (optText && optText.startsWith('/uploads/')) {
      return (
        <img 
          src={optText} 
          alt="Option graphic" 
          style={{ 
            maxHeight: '120px', 
            backgroundColor: '#ffffff', 
            padding: '6px', 
            borderRadius: '6px',
            display: 'block',
            marginTop: '6px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            objectFit: 'contain',
            cursor: 'zoom-in'
          }} 
          onClick={(e) => {
            e.stopPropagation();
            setZoomedImage(optText);
          }}
          title="Click to Zoom Option Graphic"
        />
      );
    }
    return <span>{optText}</span>;
  };

  const viewQuestionDetails = async (questionId, keepList = false) => {
    try {
      const response = await fetch(`/api/question/${questionId}`);
      if (response.ok) {
        const data = await response.json();
        setSelectedQuestion(data);
        if (!keepList) {
          setModalQuestionsList(questions);
        }
      }
    } catch (err) {
      console.error('Failed to load question details:', err);
    }
  };

  const navigateQuestion = (direction) => {
    if (!selectedQuestion || modalQuestionsList.length === 0) return;
    const currentIdx = modalQuestionsList.findIndex(q => q.Question_ID === selectedQuestion.Question_ID);
    if (currentIdx === -1) return;
    
    if (direction === 'prev' && currentIdx > 0) {
      viewQuestionDetails(modalQuestionsList[currentIdx - 1].Question_ID, true);
    } else if (direction === 'next' && currentIdx < modalQuestionsList.length - 1) {
      viewQuestionDetails(modalQuestionsList[currentIdx + 1].Question_ID, true);
    }
  };

  const drilldownFromTrends = async (subject, year) => {
    try {
      const url = `/api/questions?subject=${encodeURIComponent(subject)}&year=${encodeURIComponent(year)}&limit=1000`;
      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        if (data.questions && data.questions.length > 0) {
          setModalQuestionsList(data.questions);
          viewQuestionDetails(data.questions[0].Question_ID, true);
        } else {
          alert('No questions found for this subject and year.');
        }
      }
    } catch (err) {
      console.error('Failed to load drilldown questions:', err);
      alert('Error fetching drilldown data.');
    }
  };

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!selectedQuestion) return;
      
      if (e.key === 'Escape') {
        setSelectedQuestion(null);
      } else if (e.key === 'ArrowLeft') {
        navigateQuestion('prev');
      } else if (e.key === 'ArrowRight') {
        navigateQuestion('next');
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [selectedQuestion, modalQuestionsList]);

  const handleOpenSettings = async () => {
    setKeyLoadError('');
    setGeminiKeyInput('');
    setShowSettingsModal(true);
    try {
      const response = await fetch('/api/settings/gemini_api_key');
      if (response.ok) {
        const data = await response.json();
        setGeminiKeyExists(data.apiKeyExists);
        if (data.apiKeyExists) {
          setGeminiKeyInput(data.maskedKey); // Show as ****
        }
      }
    } catch (err) {
      console.error('Failed to load Gemini key settings:', err);
      setKeyLoadError('Failed to connect to backend configuration API.');
    }
  };

  const handleSaveSettings = async (e) => {
    e.preventDefault();
    if (!geminiKeyInput || geminiKeyInput.trim() === '') {
      alert('Please enter a valid Google Gemini API key.');
      return;
    }
    
    // If it's already masked (****) and they didn't change it, simply close modal
    if (geminiKeyExists && geminiKeyInput === '****') {
      setShowSettingsModal(false);
      return;
    }
    
    setIsSavingKey(true);
    try {
      const response = await fetch('/api/settings/gemini_api_key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: geminiKeyInput.trim() })
      });
      if (response.ok) {
        alert('Google Gemini API Key stored securely in database.');
        setShowSettingsModal(false);
      } else {
        const err = await response.json();
        alert(err.error || 'Failed to save Google Gemini API Key.');
      }
    } catch (err) {
      console.error('Failed to save API key:', err);
      alert('Network boundary failed: Cannot connect to server.');
    } finally {
      setIsSavingKey(false);
    }
  };

  // Format File Size
  const formatBytes = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Format Dates
  const formatDate = (dateStr) => {
    return new Date(dateStr).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (authChecking) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: 'radial-gradient(circle at top right, #1d1b26, #0c0a0f)', color: '#fff' }}>
        <h3>⚡ Loading secure environment...</h3>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: 'radial-gradient(circle at top right, #1d1b26, #0c0a0f)', color: '#fff', padding: '1rem' }}>
        <div className="glass-card" style={{ maxWidth: '400px', width: '100%', padding: '3rem 2.5rem', borderRadius: '16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2rem', boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.37)', background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.05)', backdropFilter: 'blur(12px)' }}>
          <div style={{ textAlign: 'center' }}>
            <span style={{ fontSize: '3.5rem' }}>🩺</span>
            <h2 style={{ fontFamily: 'var(--font-display)', marginTop: '1rem', color: '#fff', fontSize: '1.75rem', fontWeight: 800 }}>NEET PG Console</h2>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.5rem', lineHeight: '1.5' }}>
              Sign in with your Google Account to access the Ingestion & Analytics Dashboard.
            </p>
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', width: '100%' }}>
            {/* The Google Sign-In Button is rendered here by the SDK */}
            <div id="google-login-btn-parent" style={{ display: 'flex', justifyContent: 'center', width: '100%', minHeight: '40px' }}></div>
            
            {authError && (
              <div style={{ fontSize: '0.8rem', color: '#ff6b6b', textAlign: 'center', marginTop: '0.5rem', padding: '0.5rem 1rem', borderRadius: '6px', background: 'rgba(255, 107, 107, 0.1)', border: '1px solid rgba(255, 107, 107, 0.2)', width: '100%' }}>
                ⚠️ {authError}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  const startQuiz = async () => {
    try {
      let url = `/api/questions?limit=${quizSettings.limit}`;
      if (quizSettings.subject !== 'All') {
        url += `&subject=${encodeURIComponent(quizSettings.subject)}`;
      }
      if (quizSettings.year !== 'All') {
        url += `&year=${encodeURIComponent(quizSettings.year)}`;
      }
      if (quizSettings.imagesOnly) {
        url += `&hasImage=true`;
      }
      
      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        if (data.questions && data.questions.length > 0) {
          const shuffledQuestions = [...data.questions].sort(() => 0.5 - Math.random());
          const processedQuestions = shuffledQuestions.map(q => {
            const keys = [];
            if (q.Option_A !== undefined && q.Option_A !== '') keys.push('A');
            if (q.Option_B !== undefined && q.Option_B !== '') keys.push('B');
            if (q.Option_C !== undefined && q.Option_C !== '') keys.push('C');
            if (q.Option_D !== undefined && q.Option_D !== '') keys.push('D');
            const shuffledKeys = keys.sort(() => 0.5 - Math.random());
            return { ...q, _shuffledOptionKeys: shuffledKeys };
          });
          setQuizQuestions(processedQuestions);
          setCurrentQuizIdx(0);
          setQuizSelectedAnswers({});
          setIsQuizActive(true);
          setIsQuizCompleted(false);
          setQuizScore(0);
        } else {
          alert('No questions found matching the selected filters.');
        }
      }
    } catch (err) {
      console.error('Failed to load quiz questions:', err);
    }
  };

  const handleSelectQuizAnswer = (option) => {
    if (quizSelectedAnswers[currentQuizIdx] !== undefined) return;
    
    const correctAns = quizQuestions[currentQuizIdx].Correct_Answer;
    const updatedAnswers = { ...quizSelectedAnswers, [currentQuizIdx]: option };
    setQuizSelectedAnswers(updatedAnswers);
    
    if (option === correctAns) {
      setQuizScore(s => s + 1);
    }
  };



  if (userProfile && userProfile.role === 'Student') {
    return (
      <div className="app-container">
        {/* Student Header */}
        <header className="header" style={{ position: 'relative' }}>
          <div className="header-logo">
            <div className="logo-badge" style={{ background: 'linear-gradient(135deg, var(--accent-cyan), var(--accent-violet))' }}>🩺</div>
            <div>
              <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.4rem' }}>
                NEET PG Student Portal
              </h2>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                Interactive Study & Quiz Environment
              </span>
            </div>
          </div>

          <button 
            className={`hamburger-menu ${mobileMenuOpen ? 'open' : ''}`} 
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle menu"
          >
            <span className="hamburger-line"></span>
            <span className="hamburger-line"></span>
            <span className="hamburger-line"></span>
          </button>
          
          <div className={`header-nav-container ${mobileMenuOpen ? 'mobile-open' : ''}`}>
            <nav className="nav-tabs">
              <button 
                className={`nav-tab ${studentTab === 'dashboard' ? 'active' : ''}`}
                onClick={() => window.location.hash = '#/dashboard'}
              >
                Dashboard
              </button>
              <button 
                className={`nav-tab ${studentTab === 'practice' ? 'active' : ''}`}
                onClick={() => window.location.hash = '#/practice'}
              >
                Interactive Quiz
              </button>
              <button 
                className={`nav-tab ${studentTab === 'exam' ? 'active' : ''}`}
                onClick={() => window.location.hash = '#/exam'}
              >
                Exam Simulator
              </button>

              <button 
                className={`nav-tab ${studentTab === 'questions' ? 'active' : ''}`}
                onClick={() => window.location.hash = '#/question-bank'}
              >
                Question Bank
              </button>
              <button 
                className={`nav-tab ${studentTab === 'trends' ? 'active' : ''}`}
                onClick={() => window.location.hash = '#/trends'}
              >
                Weightage Trends
              </button>
              <button 
                className={`nav-tab ${studentTab === 'progress' ? 'active' : ''}`}
                onClick={() => window.location.hash = '#/progress'}
              >
                Progress Tracker
              </button>
            </nav>

            {userProfile && (
              <div className="user-profile-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  {userProfile.picture ? (
                    <img 
                      src={userProfile.picture} 
                      alt={userProfile.name} 
                      style={{ width: '32px', height: '32px', borderRadius: '50%', border: '1.5px solid var(--accent-cyan)' }}
                    />
                  ) : (
                    <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'var(--accent-violet)', display: 'flex', justifyContent: 'center', alignItems: 'center', fontWeight: 'bold', fontSize: '0.85rem' }}>
                      {userProfile.name.charAt(0)}
                    </div>
                  )}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                    <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#fff', lineHeight: '1.2' }}>{userProfile.name}</span>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{userProfile.email}</span>
                  </div>
                </div>
                <button 
                  onClick={handleLogout}
                  style={{ background: 'rgba(255, 107, 107, 0.1)', border: '1px solid rgba(255, 107, 107, 0.2)', color: '#ff6b6b', padding: '0.35rem 0.75rem', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s' }}
                >
                  Sign Out
                </button>
              </div>
            )}
          </div>
        </header>

        {/* Global Student Stats */}
        {(studentTab === 'dashboard' || studentTab === 'questions') && (
          <section className="stats-strip">
            <div className="stat-box purple">
              <span className="stat-label">Total Practice Bank</span>
              <div className="stat-value">
                {stats.totalQuestions || 0} <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Questions</span>
              </div>
            </div>
            <div className="stat-box cyan">
              <span className="stat-label">Available Subjects</span>
              <div className="stat-value">
                {stats.subjects ? stats.subjects.length : 0} <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Subjects</span>
              </div>
            </div>
            <div className="stat-box emerald">
              <span className="stat-label">Image-based Qs</span>
              <div className="stat-value">
                {stats.imageCount || 0} <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Visual Diagrams</span>
              </div>
            </div>
          </section>
        )}

        {/* Dynamic Tab Contents */}
        {studentTab === 'dashboard' && (
          <div className="dashboard-grid">
            {/* Welcome Banner */}
            <div className="panel-card" style={{ gridColumn: 'span 2' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', flexWrap: 'wrap' }}>
                <div style={{ fontSize: '3rem' }}>🎯</div>
                <div>
                  <h3 style={{ fontSize: '1.6rem', color: '#fff', marginBottom: '0.5rem' }}>Welcome to Your NEET PG Workspace, Dr. {userProfile.name.split(' ')[0]}!</h3>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', lineHeight: '1.6' }}>
                    Access high-yield exam recall items, practice custom quiz sets by subject, and visualize clinical trends to maximize your scores.
                  </p>
                </div>
              </div>
            </div>

            {/* Action Cards */}
            <div className="panel-card" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <h3 className="panel-title"><span>📝</span> Start a Daily Challenge</h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
                Jump straight into a fast-paced quiz consisting of 10 random clinical scenario recall questions.
              </p>
              <button 
                className="btn btn-cyan" 
                style={{ width: '100%', padding: '0.75rem', fontWeight: 600, display: 'inline-flex', justifyContent: 'center', gap: '0.5rem' }}
                onClick={() => {
                  setQuizSettings({ subject: 'All', year: 'All', limit: 10, imagesOnly: false });
                  window.location.hash = '#/practice';
                  setTimeout(startQuiz, 100);
                }}
              >
                ⚡ Start 10-Question Challenge
              </button>
            </div>

            <div className="panel-card">
              <h3 className="panel-title"><span>🔮</span> High-Yield Topic Predictions</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', marginTop: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem', borderBottom: '1px solid var(--border-glass)' }}>
                  <span style={{ fontSize: '0.85rem' }}>Cardiology: Coronary Occlusions</span>
                  <span className="status-badge completed" style={{ fontSize: '0.7rem' }}>94% Yield</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem', borderBottom: '1px solid var(--border-glass)' }}>
                  <span style={{ fontSize: '0.85rem' }}>Thyroid Pathology: Histological features</span>
                  <span className="status-badge completed" style={{ fontSize: '0.7rem' }}>88% Yield</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem' }}>
                  <span style={{ fontSize: '0.85rem' }}>Neonatology: Ground-glass RDS signs</span>
                  <span className="status-badge pending" style={{ fontSize: '0.7rem' }}>76% Yield</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {studentTab === 'practice' && (
          <div className="panel-card" style={{ minHeight: '500px' }}>
            {!isQuizActive && !isQuizCompleted ? (
              /* Quiz Configuration Screen */
              <div style={{ maxWidth: '500px', margin: '2rem auto', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
                  <span style={{ fontSize: '2.5rem' }}>📚</span>
                  <h3 style={{ fontSize: '1.5rem', color: '#fff', marginTop: '0.5rem' }}>Configure Practice Session</h3>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Pick target criteria to load an active recall challenge.</p>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Select Subject</label>
                  <select 
                    className="form-control"
                    value={quizSettings.subject}
                    onChange={(e) => setQuizSettings({ ...quizSettings, subject: e.target.value })}
                  >
                    <option value="All">All Subjects</option>
                    {stats.subjects && stats.subjects.map(s => (
                      <option key={s.Subject} value={s.Subject}>{s.Subject}</option>
                    ))}
                  </select>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Select Year</label>
                  <select 
                    className="form-control"
                    value={quizSettings.year}
                    onChange={(e) => setQuizSettings({ ...quizSettings, year: e.target.value })}
                  >
                    <option value="All">All Years</option>
                    {stats.years && stats.years.map(y => (
                      <option key={y.year} value={y.year}>{y.year}</option>
                    ))}
                  </select>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Number of Questions</label>
                  <select 
                    className="form-control"
                    value={quizSettings.limit}
                    onChange={(e) => setQuizSettings({ ...quizSettings, limit: parseInt(e.target.value) })}
                  >
                    <option value={5}>5 Questions</option>
                    <option value={10}>10 Questions</option>
                    <option value={20}>20 Questions</option>
                    <option value={50}>50 Questions</option>
                    <option value={100}>100 Questions</option>
                    <option value={200}>200 Questions</option>
                  </select>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', margin: '0.5rem 0' }}>
                  <input 
                    type="checkbox"
                    id="quizImagesOnly"
                    checked={quizSettings.imagesOnly}
                    onChange={(e) => setQuizSettings({ ...quizSettings, imagesOnly: e.target.checked })}
                    style={{ cursor: 'pointer', width: '18px', height: '18px', accentColor: 'var(--accent-cyan)' }}
                  />
                  <label htmlFor="quizImagesOnly" style={{ fontSize: '0.85rem', color: 'var(--text-primary)', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }}>
                    Practice questions with images only 🖼️
                  </label>
                </div>

                <button className="btn btn-cyan" style={{ marginTop: '0.5rem', padding: '0.75rem', fontWeight: 600 }} onClick={startQuiz}>
                  🚀 Start Practice Quiz
                </button>
              </div>
            ) : isQuizActive && quizQuestions.length > 0 ? (
              /* Active Quiz Screen */
              (() => {
                const q = quizQuestions[currentQuizIdx];
                const selectedAns = quizSelectedAnswers[currentQuizIdx];
                const isAnswered = selectedAns !== undefined;
                
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-glass)', paddingBottom: '1rem' }}>
                      <div>
                        <span className="badge subject">{q.Subject}</span>
                        <span className="badge difficulty" style={{ marginLeft: '0.5rem' }}>{q.Difficulty_Level}</span>
                      </div>
                      <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                        Question {currentQuizIdx + 1} of {quizQuestions.length}
                      </span>
                    </div>

                    {/* Progress Bar */}
                    <div style={{ background: 'rgba(255,255,255,0.05)', height: '6px', borderRadius: '99px', overflow: 'hidden' }}>
                      <div style={{ background: 'var(--accent-cyan)', height: '100%', width: `${((currentQuizIdx + 1) / quizQuestions.length) * 100}%`, transition: 'width 0.2s' }}></div>
                    </div>

                    <div style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-glass)', padding: '1.5rem', borderRadius: '12px' }}>
                      <p style={{ fontWeight: 500, fontSize: '1.1rem', lineHeight: '1.6' }}>{q.Question_Text}</p>
                    </div>

                    {/* Medical diagram if present */}
                    {(q.Image_Present === 1 || q.Image_Present === true) && q.Embedded_Image && (
                      <div style={{ display: 'flex', justifyContent: 'center', background: '#fff', padding: '12px', borderRadius: '12px', border: '1px solid var(--border-glass)' }}>
                        <img src={q.Embedded_Image} alt="Recall Diagram" style={{ maxHeight: '280px', objectFit: 'contain', cursor: 'zoom-in' }} onClick={() => setZoomedImage(q.Embedded_Image)} />
                      </div>
                    )}

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '0.5rem' }}>
                      {(q._shuffledOptionKeys || ['A', 'B', 'C', 'D']).map(opt => {
                        const optText = q[`Option_${opt}`];
                        if (!optText) return null;
                        
                        const isCorrect = q.Correct_Answer === opt;
                        const isSelected = selectedAns === opt;
                        
                        let borderStyle = '1px solid var(--border-glass)';
                        let bgStyle = 'rgba(255,255,255,0.02)';
                        
                        if (isAnswered) {
                          if (isCorrect) {
                            borderStyle = '2px solid var(--success-emerald)';
                            bgStyle = 'rgba(16, 185, 129, 0.15)';
                          } else if (isSelected) {
                            borderStyle = '2px solid var(--danger-rose)';
                            bgStyle = 'rgba(244, 63, 94, 0.15)';
                          }
                        }
                        
                        return (
                          <div 
                            key={opt}
                            onClick={() => handleSelectQuizAnswer(opt)}
                            style={{ 
                              border: borderStyle,
                              background: bgStyle,
                              padding: '1.25rem',
                              borderRadius: '12px',
                              cursor: isAnswered ? 'default' : 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '1rem',
                              transition: 'all 0.2s ease',
                              minHeight: '65px'
                            }}
                            className={!isAnswered ? "table-row-hover" : ""}
                          >
                            <span style={{
                              width: '28px',
                              height: '28px',
                              borderRadius: '50%',
                              background: isAnswered && isCorrect ? 'var(--success-emerald)' : isAnswered && isSelected ? 'var(--danger-rose)' : 'rgba(255,255,255,0.1)',
                              display: 'flex',
                              justifyContent: 'center',
                              alignItems: 'center',
                              fontWeight: 700,
                              fontSize: '0.85rem'
                            }}>{opt}</span>
                            <div style={{ flex: 1 }}>{renderOptionText(optText)}</div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Explanation Box */}
                    {isAnswered && q.Answer_Explanation && (
                      <div className="explanation-box" style={{ marginTop: '1rem' }}>
                        <h4 style={{ color: 'var(--accent-violet)', fontSize: '0.95rem', fontWeight: 700, marginBottom: '0.5rem' }}>Clinical Rationale &amp; Answer Explanation</h4>
                        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: '1.6' }}>{q.Answer_Explanation}</p>
                      </div>
                    )}

                    {/* Next / Finish Navigation Button */}
                    {isAnswered && (
                      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
                        {currentQuizIdx < quizQuestions.length - 1 ? (
                          <button className="btn btn-cyan" style={{ padding: '0.5rem 1.5rem' }} onClick={() => setCurrentQuizIdx(idx => idx + 1)}>
                            Next Question →
                          </button>
                        ) : (
                          <button className="btn btn-primary" style={{ padding: '0.5rem 1.5rem' }} onClick={submitQuiz}>
                            Finish Quiz 🏁
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })()
            ) : (
              /* Quiz Finished/Results Screen */
              <div style={{ maxWidth: '600px', margin: '2rem auto', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                <div>
                  <span style={{ fontSize: '4rem' }}>🏆</span>
                  <h3 style={{ fontSize: '1.8rem', color: '#fff', marginTop: '0.5rem', fontWeight: 800 }}>Practice Challenge Complete</h3>
                  <p style={{ fontSize: '0.95rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>Great job on finishing your study recall module!</p>
                </div>

                <div style={{ background: 'var(--bg-secondary)', padding: '2rem', borderRadius: '16px', border: '1px solid var(--border-glass)' }}>
                  <span style={{ display: 'block', fontSize: '1.1rem', color: 'var(--text-secondary)' }}>Your Final Score</span>
                  <span style={{ display: 'block', fontSize: '3rem', fontWeight: 800, color: 'var(--accent-cyan)', margin: '0.5rem 0' }}>
                    {quizScore} <span style={{ fontSize: '1.5rem', color: 'var(--text-muted)' }}>/ {quizQuestions.length}</span>
                  </span>
                  <span className="status-badge completed" style={{ background: quizScore / quizQuestions.length >= 0.7 ? 'rgba(16,185,129,0.15)' : 'rgba(245,158,11,0.15)', color: quizScore / quizQuestions.length >= 0.7 ? 'var(--success-emerald)' : 'var(--warning-amber)', padding: '0.35rem 1rem', fontSize: '0.85rem' }}>
                    {quizScore / quizQuestions.length >= 0.7 ? 'High-Yield Performance!' : 'Needs Revision'}
                  </span>
                </div>

                <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
                  <button className="btn btn-cyan" style={{ padding: '0.65rem 1.5rem', fontWeight: 600 }} onClick={() => { setIsQuizCompleted(false); setIsQuizActive(false); }}>
                    Practice Another Topic
                  </button>
                  <button className="btn btn-secondary" style={{ padding: '0.65rem 1.5rem' }} onClick={() => { setStudentTab('questions'); window.location.hash = '#/question-bank'; }}>
                    Browse Question Bank
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {studentTab === 'exam' && (
          <div className="panel-card" style={{ minHeight: '500px', display: 'flex', flexDirection: 'column' }}>
            {examLoading ? (
              <div style={{ textAlign: 'center', padding: '5rem', color: 'var(--text-muted)' }}>
                <span className="pulse-glow" style={{ fontSize: '1.25rem', color: 'var(--accent-cyan)' }}>
                  ⏳ Generating standard NEET PG simulated exam... proportional allocation active
                </span>
              </div>
            ) : !isExamActive && !isExamCompleted ? (
              /* Exam Intro / Launch Page */
              <div style={{ maxWidth: '650px', margin: '2rem auto', display: 'flex', flexDirection: 'column', gap: '1.5rem', textAlign: 'center' }}>
                <span style={{ fontSize: '4rem' }}>📝</span>
                <h3 style={{ fontSize: '1.8rem', color: '#fff', fontWeight: 800 }}>NEET PG Exam Simulator</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', lineHeight: '1.6' }}>
                  This panel runs a high-fidelity simulation of the official NEET PG computer-based exam.
                </p>

                <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-glass)', borderRadius: '14px', padding: '1.5rem', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <h4 style={{ color: 'var(--accent-cyan)', fontWeight: 700, fontSize: '1.05rem', marginBottom: '0.25rem' }}>Exam Rules & Parameters:</h4>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <span>⏱️ <strong>Duration:</strong> 3 hours 30 minutes (210 mins) dynamic timer.</span>
                    <span>❓ <strong>Questions:</strong> 200 multiple-choice questions proportionally distributed based on historical subject frequencies.</span>
                    <span>🟢 <strong>Marking:</strong> +4 marks for correct answers, -1 mark negative marking for incorrect answers.</span>
                    <span>🎛️ <strong>Navigation Palette:</strong> Save responses, skip, or mark questions for review using the side grid panel.</span>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', justifyContent: 'center', margin: '0.5rem 0' }}>
                  <input 
                    type="checkbox"
                    id="examImagesOnly"
                    checked={examImagesOnly}
                    onChange={(e) => setExamImagesOnly(e.target.checked)}
                    style={{ cursor: 'pointer', width: '18px', height: '18px', accentColor: 'var(--accent-cyan)' }}
                  />
                  <label htmlFor="examImagesOnly" style={{ fontSize: '0.9rem', color: 'var(--text-primary)', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }}>
                    Simulate exam with image questions only 🖼️
                  </label>
                </div>

                <button className="btn btn-cyan" style={{ padding: '0.85rem', fontWeight: 700, fontSize: '1rem', marginTop: '0.5rem' }} onClick={generateExam}>
                  🚀 Start NEET PG Exam Simulation
                </button>
              </div>
            ) : isExamActive ? (
              /* Active Simulated Exam Panel */
              (() => {
                const q = examQuestions[currentExamIdx];
                if (!q) return null;
                const selectedAns = examSelectedAnswers[q.Question_ID];
                const isSelected = selectedAns !== undefined;
                
                const hours = Math.floor(examTimeRemaining / 3600);
                const minutes = Math.floor((examTimeRemaining % 3600) / 60);
                const seconds = examTimeRemaining % 60;
                
                const statuses = Object.values(examStatus);
                const countAnswered = statuses.filter(s => s === 'answered').length;
                const countUnanswered = statuses.filter(s => s === 'unanswered').length;
                const countMarked = statuses.filter(s => s === 'marked_for_review').length;
                const countAnsweredMarked = statuses.filter(s => s === 'answered_marked_for_review').length;
                const countUnvisited = examQuestions.length - countAnswered - countUnanswered - countMarked - countAnsweredMarked;

                return (
                  <div className="exam-container-layout">
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-glass)', paddingBottom: '1rem' }}>
                        <div>
                          <span className="badge subject" style={{ padding: '0.4rem 0.85rem' }}>{q.Subject}</span>
                          <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginLeft: '1rem' }}>recall reference year: {q.Previous_Year}</span>
                        </div>
                        <div style={{ fontSize: '1.25rem', fontFamily: 'Consolas, monospace', color: examTimeRemaining < 600 ? 'var(--danger-rose)' : 'var(--accent-cyan)', fontWeight: 700 }}>
                          ⏱️ {hours.toString().padStart(2, '0')}:{minutes.toString().padStart(2, '0')}:{seconds.toString().padStart(2, '0')}
                        </div>
                      </div>

                      <div>
                        <h4 style={{ color: '#fff', fontSize: '1.1rem', marginBottom: '0.5rem' }}>Question {currentExamIdx + 1}:</h4>
                        <div style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-glass)', padding: '1.5rem', borderRadius: '12px', minHeight: '120px' }}>
                          <p style={{ fontWeight: 500, fontSize: '1.05rem', lineHeight: '1.6' }}>{q.Question_Text}</p>
                        </div>
                      </div>

                      {(q.Image_Present === 1 || q.Image_Present === true) && q.Embedded_Image && (
                        <div style={{ display: 'flex', justifyContent: 'center', background: '#fff', padding: '12px', borderRadius: '12px', border: '1px solid var(--border-glass)' }}>
                          <img src={q.Embedded_Image} alt="Exam Diagram" style={{ maxHeight: '240px', objectFit: 'contain', cursor: 'zoom-in' }} onClick={() => setZoomedImage(q.Embedded_Image)} />
                        </div>
                      )}

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                        {(q._shuffledOptionKeys || ['A', 'B', 'C', 'D']).map(opt => {
                          const optText = q[`Option_${opt}`];
                          if (!optText) return null;
                          const activeSelect = selectedAns === opt;
                          return (
                            <div 
                              key={opt}
                              onClick={() => handleExamOptionClick(opt)}
                              style={{ 
                                border: activeSelect ? '2px solid var(--accent-cyan)' : '1px solid var(--border-glass)',
                                background: activeSelect ? 'rgba(6, 182, 212, 0.08)' : 'rgba(255,255,255,0.015)',
                                padding: '1.1rem 1.25rem',
                                borderRadius: '12px',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '1rem',
                                transition: 'all 0.2s'
                              }}
                              className="table-row-hover"
                            >
                              <span style={{
                                width: '26px',
                                height: '26px',
                                borderRadius: '50%',
                                background: activeSelect ? 'var(--accent-cyan)' : 'rgba(255,255,255,0.1)',
                                color: activeSelect ? '#000' : '#fff',
                                display: 'flex',
                                justifyContent: 'center',
                                alignItems: 'center',
                                fontWeight: 700,
                                fontSize: '0.8rem'
                              }}>{opt}</span>
                              <div style={{ flex: 1 }}>{renderOptionText(optText)}</div>
                            </div>
                          );
                        })}
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem', marginTop: '1rem', borderTop: '1px solid var(--border-glass)', paddingTop: '1.5rem' }}>
                        <div style={{ display: 'flex', gap: '0.75rem' }}>
                          <button className="btn btn-secondary" style={{ padding: '0.65rem 1.25rem', color: 'var(--text-secondary)' }} onClick={handleClearExamResponse}>
                            Clear Response
                          </button>
                          <button className="btn btn-secondary" style={{ padding: '0.65rem 1.25rem', background: 'rgba(139, 92, 246, 0.1)', color: '#a78bfa' }} onClick={handleMarkForReview}>
                            Mark for Review &amp; Next
                          </button>
                        </div>

                        <div style={{ display: 'flex', gap: '0.75rem' }}>
                          <button className="btn btn-cyan" style={{ padding: '0.65rem 1.5rem', fontWeight: 600 }} onClick={handleSaveAndNext}>
                            Save &amp; Next
                          </button>
                        </div>
                      </div>
                    </div>

                    <div style={{ borderLeft: '1px solid var(--border-glass)', paddingLeft: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                      <div>
                        <h4 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#fff', marginBottom: '0.75rem' }}>Question Palette</h4>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '0.4rem', maxHeight: '280px', overflowY: 'auto', paddingRight: '0.25rem' }}>
                          {examQuestions.map((eq, index) => {
                            const status = examStatus[eq.Question_ID] || 'unvisited';
                            let bgColor = 'rgba(255,255,255,0.05)';
                            let textColor = 'var(--text-secondary)';
                            let border = '1px solid var(--border-glass)';
                            
                            if (status === 'answered') {
                              bgColor = 'var(--success-emerald)';
                              textColor = '#fff';
                            } else if (status === 'unanswered') {
                              bgColor = 'var(--danger-rose)';
                              textColor = '#fff';
                            } else if (status === 'marked_for_review') {
                              bgColor = 'var(--accent-violet)';
                              textColor = '#fff';
                            } else if (status === 'answered_marked_for_review') {
                              bgColor = 'var(--accent-violet)';
                              textColor = '#fff';
                              border = '2px solid var(--success-emerald)';
                            }
                            
                            const isCurrent = currentExamIdx === index;
                            if (isCurrent) {
                              border = '2px solid var(--accent-cyan)';
                            }

                            return (
                              <button
                                key={eq.Question_ID}
                                onClick={() => {
                                  const currentQ = examQuestions[currentExamIdx];
                                  if (examStatus[currentQ.Question_ID] === 'unvisited') {
                                    setExamStatus({ ...examStatus, [currentQ.Question_ID]: 'unanswered' });
                                  }
                                  setCurrentExamIdx(index);
                                }}
                                style={{
                                  background: bgColor,
                                  color: textColor,
                                  border: border,
                                  borderRadius: '6px',
                                  padding: '0.35rem 0',
                                  fontSize: '0.75rem',
                                  fontWeight: 600,
                                  cursor: 'pointer',
                                  textAlign: 'center'
                                }}
                              >
                                {index + 1}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.75rem', background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-glass)', padding: '1rem', borderRadius: '10px' }}>
                        <div style={{ display: 'flex', justifyItems: 'center', gap: '0.5rem' }}>
                          <span style={{ width: '12px', height: '12px', background: 'var(--success-emerald)', borderRadius: '2px', display: 'inline-block' }}></span>
                          <span>Answered ({countAnswered})</span>
                        </div>
                        <div style={{ display: 'flex', justifyItems: 'center', gap: '0.5rem' }}>
                          <span style={{ width: '12px', height: '12px', background: 'var(--danger-rose)', borderRadius: '2px', display: 'inline-block' }}></span>
                          <span>Unanswered ({countUnanswered})</span>
                        </div>
                        <div style={{ display: 'flex', justifyItems: 'center', gap: '0.5rem' }}>
                          <span style={{ width: '12px', height: '12px', background: 'var(--accent-violet)', borderRadius: '2px', display: 'inline-block' }}></span>
                          <span>Marked for Review ({countMarked})</span>
                        </div>
                        <div style={{ display: 'flex', justifyItems: 'center', gap: '0.5rem' }}>
                          <span style={{ width: '12px', height: '12px', background: 'var(--accent-violet)', border: '1.5px solid var(--success-emerald)', borderRadius: '2px', display: 'inline-block' }}></span>
                          <span>Ans &amp; Marked for Review ({countAnsweredMarked})</span>
                        </div>
                        <div style={{ display: 'flex', justifyItems: 'center', gap: '0.5rem' }}>
                          <span style={{ width: '12px', height: '12px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-glass)', borderRadius: '2px', display: 'inline-block' }}></span>
                          <span>Not Visited ({countUnvisited})</span>
                        </div>
                      </div>

                      <button className="btn btn-primary" style={{ width: '100%', padding: '0.75rem', fontWeight: 700, marginTop: 'auto' }} onClick={() => {
                        if (window.confirm("Are you sure you want to submit your final exam answers?")) {
                          submitExam();
                        }
                      }}>
                        Submit Exam 🏁
                      </button>
                    </div>
                  </div>
                );
              })()
            ) : (
              /* Exam Results Summary Screen */
              (() => {
                let correctCount = 0;
                let incorrectCount = 0;
                let unattemptedCount = 0;
                const subjectBreakdown = {};

                examQuestions.forEach(q => {
                  const selected = examSelectedAnswers[q.Question_ID];
                  const status = examStatus[q.Question_ID];
                  
                  const isEvaluated = selected !== undefined && (status === 'answered' || status === 'answered_marked_for_review');
                  
                  if (!subjectBreakdown[q.Subject]) {
                    subjectBreakdown[q.Subject] = { total: 0, correct: 0, score: 0 };
                  }
                  subjectBreakdown[q.Subject].total += 1;

                  if (isEvaluated) {
                    if (selected === q.Correct_Answer) {
                      correctCount += 1;
                      subjectBreakdown[q.Subject].correct += 1;
                      subjectBreakdown[q.Subject].score += 4;
                    } else {
                      incorrectCount += 1;
                      subjectBreakdown[q.Subject].score -= 1;
                    }
                  } else {
                    unattemptedCount += 1;
                  }
                });

                const finalMarks = (correctCount * 4) - (incorrectCount * 1);
                const maxMarks = examQuestions.length * 4;
                const accuracy = (correctCount + incorrectCount) > 0 
                  ? ((correctCount / (correctCount + incorrectCount)) * 100).toFixed(1)
                  : '0.0';

                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                    <div style={{ textAlign: 'center', borderBottom: '1px solid var(--border-glass)', paddingBottom: '1.5rem' }}>
                      <span style={{ fontSize: '4.5rem' }}>🎓</span>
                      <h3 style={{ fontSize: '2rem', color: '#fff', fontWeight: 800, marginTop: '0.5rem' }}>NEET PG Exam Scorecard</h3>
                      <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>Official Simulation Recall Evaluation Report</p>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1.25rem' }}>
                      <div style={{ background: 'rgba(255,255,255,0.015)', border: '1px solid var(--border-glass)', padding: '1.5rem', borderRadius: '16px', textAlign: 'center' }}>
                        <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Score Obtained</span>
                        <span style={{ display: 'block', fontSize: '2.2rem', fontWeight: 800, color: 'var(--accent-cyan)', margin: '0.5rem 0' }}>{finalMarks}</span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Out of {maxMarks} Marks</span>
                      </div>
                      <div style={{ background: 'rgba(255,255,255,0.015)', border: '1px solid var(--border-glass)', padding: '1.5rem', borderRadius: '16px', textAlign: 'center' }}>
                        <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Accuracy Rate</span>
                        <span style={{ display: 'block', fontSize: '2.2rem', fontWeight: 800, color: 'var(--accent-violet)', margin: '0.5rem 0' }}>{accuracy}%</span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>On evaluated questions</span>
                      </div>
                      <div style={{ background: 'rgba(255,255,255,0.015)', border: '1px solid var(--border-glass)', padding: '1.5rem', borderRadius: '16px', textAlign: 'center' }}>
                        <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Correct Answers</span>
                        <span style={{ display: 'block', fontSize: '2.2rem', fontWeight: 800, color: 'var(--success-emerald)', margin: '0.5rem 0' }}>{correctCount}</span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>+{correctCount * 4} Marks</span>
                      </div>
                      <div style={{ background: 'rgba(255,255,255,0.015)', border: '1px solid var(--border-glass)', padding: '1.5rem', borderRadius: '16px', textAlign: 'center' }}>
                        <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Incorrect (Negative)</span>
                        <span style={{ display: 'block', fontSize: '2.2rem', fontWeight: 800, color: 'var(--danger-rose)', margin: '0.5rem 0' }}>{incorrectCount}</span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>-{incorrectCount} Marks</span>
                      </div>
                    </div>

                    <div className="panel-card">
                      <h4 style={{ color: '#fff', fontSize: '1.05rem', marginBottom: '1rem' }}>Subject-wise Performance Breakdown:</h4>
                      <div style={{ overflowX: 'auto', borderRadius: '10px', border: '1px solid var(--border-glass)' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', textAlign: 'left' }}>
                          <thead>
                            <tr style={{ background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid var(--border-glass)' }}>
                              <th style={{ padding: '0.75rem 1rem' }}>Subject</th>
                              <th style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>Questions</th>
                              <th style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>Correct</th>
                              <th style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>Subject Marks</th>
                            </tr>
                          </thead>
                          <tbody>
                            {Object.entries(subjectBreakdown).map(([subjName, data]) => (
                              <tr key={subjName} style={{ borderBottom: '1px solid var(--border-glass)' }}>
                                <td style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>{subjName}</td>
                                <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>{data.total}</td>
                                <td style={{ padding: '0.75rem 1rem', textAlign: 'center', color: 'var(--success-emerald)', fontWeight: 600 }}>{data.correct}</td>
                                <td style={{ padding: '0.75rem 1rem', textAlign: 'center', color: data.score >= 0 ? 'var(--accent-cyan)' : 'var(--danger-rose)', fontWeight: 700 }}>
                                  {data.score}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
                      <button className="btn btn-cyan" style={{ padding: '0.75rem 1.5rem', fontWeight: 600 }} onClick={() => { setIsExamCompleted(false); setIsExamActive(false); }}>
                        Start New Exam Simulation
                      </button>
                    </div>
                  </div>
                );
              })()
            )}
          </div>
        )}

        {studentTab === 'questions' && (
          <div className="panel-card" style={{ minHeight: '500px' }}>
            <div className="panel-header">
              <h3 className="panel-title"><span>📂</span> Browse High-Yield Question Bank</h3>
              <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                <button 
                  className="btn btn-secondary" 
                  style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem', background: layoutMode === 'grid' ? 'rgba(139, 92, 246, 0.15)' : 'rgba(255,255,255,0.02)', color: layoutMode === 'grid' ? 'var(--text-primary)' : 'var(--text-secondary)', border: '1px solid var(--border-glass)', borderRadius: '8px', cursor: 'pointer' }}
                  onClick={() => setLayoutMode('grid')}
                >
                  🎴 Card View
                </button>
                <button 
                  className="btn btn-secondary" 
                  style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem', background: layoutMode === 'table' ? 'rgba(139, 92, 246, 0.15)' : 'rgba(255,255,255,0.02)', color: layoutMode === 'table' ? 'var(--text-primary)' : 'var(--text-secondary)', border: '1px solid var(--border-glass)', borderRadius: '8px', cursor: 'pointer' }}
                  onClick={() => setLayoutMode('table')}
                >
                  📋 Compact Table
                </button>
              </div>
            </div>

            {/* Read-Only Filter Row */}
            <div className="filter-bar" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.75rem', marginBottom: '1.5rem' }}>
              <input 
                type="text" 
                className="form-control"
                placeholder="🔍 Search recall items..."
                value={searchTerm}
                onChange={(e) => { setSearchTerm(e.target.value); setPage(1); }}
              />
              
              <select 
                className="form-control"
                value={subjectFilter}
                onChange={(e) => { setSubjectFilter(e.target.value); setPage(1); }}
              >
                <option value="All">All Subjects</option>
                {stats.subjects && stats.subjects.map(s => (
                  <option key={s.Subject} value={s.Subject}>{s.Subject} ({s.count})</option>
                ))}
              </select>

              <select 
                className="form-control"
                value={difficultyFilter}
                onChange={(e) => { setDifficultyFilter(e.target.value); setPage(1); }}
              >
                <option value="All">All Difficulties</option>
                <option value="Easy">Easy</option>
                <option value="Medium">Medium</option>
                <option value="Hard">Hard</option>
              </select>

              <select 
                className="form-control"
                value={imageFilter}
                onChange={(e) => { setImageFilter(e.target.value); setPage(1); }}
              >
                <option value="All">All Images</option>
                <option value="Yes">With Images</option>
                <option value="No">Without Images</option>
              </select>

              <select 
                className="form-control"
                value={yearFilter}
                onChange={(e) => { setYearFilter(e.target.value); setPage(1); }}
              >
                <option value="All">All Years</option>
                {stats.years && stats.years.map(y => (
                  <option key={y.year} value={y.year}>{y.year} ({y.count})</option>
                ))}
              </select>

              <select 
                className="form-control"
                value={itemsPerPage}
                onChange={(e) => { setItemsPerPage(parseInt(e.target.value)); setPage(1); }}
              >
                <option value={25}>25 per page</option>
                <option value={50}>50 per page</option>
                <option value={100}>100 per page</option>
              </select>
            </div>

            {/* Read-Only Questions Grid/Table */}
            {questions.length === 0 ? (
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '5rem' }}>
                <span>🔍 No recall questions match the selected filter conditions</span>
              </div>
            ) : (
              <>
                {layoutMode === 'table' ? (
                  <div style={{ overflowX: 'auto', background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-glass)', borderRadius: '12px', marginBottom: '1.5rem' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
                      <thead>
                        <tr style={{ background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid var(--border-glass)' }}>
                          <th style={{ padding: '0.85rem 1rem', fontWeight: 600 }}>Q No</th>
                          <th style={{ padding: '0.85rem 1rem', fontWeight: 600 }}>Subject</th>
                          <th style={{ padding: '0.85rem 1rem', fontWeight: 600 }}>Question Text</th>
                          <th style={{ padding: '0.85rem 1rem', fontWeight: 600 }}>Difficulty</th>
                          <th style={{ padding: '0.85rem 1rem', fontWeight: 600 }}>Confidence</th>
                        </tr>
                      </thead>
                      <tbody>
                        {questions.map(q => (
                          <tr 
                            key={q.Question_ID} 
                            onClick={() => viewQuestionDetails(q.Question_ID)}
                            style={{ borderBottom: '1px solid var(--border-glass)', cursor: 'pointer', transition: 'background 0.2s' }}
                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.02)'}
                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                          >
                            <td style={{ padding: '0.85rem 1rem', fontWeight: 700, color: 'var(--text-muted)' }}>{q.Question_Number}</td>
                            <td style={{ padding: '0.85rem 1rem' }}>
                              <span className="badge subject">{q.Subject}</span>
                            </td>
                            <td style={{ padding: '0.85rem 1rem', maxWidth: '420px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {q.Question_Text}
                            </td>
                            <td style={{ padding: '0.85rem 1rem' }}>
                              <span className="badge difficulty">{q.Difficulty_Level}</span>
                            </td>
                            <td style={{ padding: '0.85rem 1rem' }}>
                              <span className={`badge conf-${q.OCR_Confidence}`}>OCR {q.OCR_Confidence}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="questions-grid">
                    {questions.map(q => (
                      <div key={q.Question_ID} className="question-card" onClick={() => viewQuestionDetails(q.Question_ID)}>
                        <div className="q-card-header">
                          <span className="q-num">Q. {q.Question_Number}</span>
                          <span className={`badge conf-${q.OCR_Confidence}`}>OCR {q.OCR_Confidence}</span>
                        </div>
                        <p className="q-text">{q.Question_Text}</p>
                        <div className="q-footer">
                          <span className="badge subject">{q.Subject}</span>
                          <span className="badge difficulty">{q.Difficulty_Level}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Pagination Controls */}
                <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', marginTop: '2rem', alignItems: 'center' }}>
                  <button 
                    className="btn btn-secondary" 
                    style={{ padding: '0.4rem 1rem' }}
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                  >
                    Previous
                  </button>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                    Page {page} of {Math.ceil(totalQuestions / itemsPerPage) || 1}
                  </span>
                  <button 
                    className="btn btn-secondary" 
                    style={{ padding: '0.4rem 1rem' }}
                    onClick={() => setPage(p => p + 1)}
                    disabled={page >= Math.ceil(totalQuestions / itemsPerPage)}
                  >
                    Next
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {studentTab === 'trends' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            {/* YoY Matrix */}
            <div className="panel-card" style={{ width: '100%', padding: '1.75rem', overflow: 'hidden' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--border-glass)', paddingBottom: '1.25rem' }}>
                <div>
                  <h3 className="panel-title" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span>📈</span> Year-over-Year (YoY) Subject Analytics Matrix
                  </h3>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                    Analyze how many questions from each subject appeared in specific years and examine subject concentration heatmaps.
                  </p>
                </div>
                <div style={{ display: 'flex', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-glass)', borderRadius: '8px', padding: '2px' }}>
                  <button 
                    className={`btn ${trendsViewMode === 'matrix' ? 'btn-primary' : ''}`}
                    style={{ padding: '0.35rem 0.85rem', fontSize: '0.8rem', border: 'none', borderRadius: '6px', background: trendsViewMode === 'matrix' ? '' : 'transparent' }}
                    onClick={() => setTrendsViewMode('matrix')}
                  >
                    📊 Matrix Grid
                  </button>
                  <button 
                    className={`btn ${trendsViewMode === 'flat' ? 'btn-primary' : ''}`}
                    style={{ padding: '0.35rem 0.85rem', fontSize: '0.8rem', border: 'none', borderRadius: '6px', background: trendsViewMode === 'flat' ? '' : 'transparent' }}
                    onClick={() => setTrendsViewMode('flat')}
                  >
                    📋 Flat List
                  </button>
                </div>
              </div>

              {trendsLoading ? (
                <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '5rem' }}>
                  <span className="pulse-glow" style={{ display: 'inline-block', fontSize: '1.25rem', color: 'var(--accent-violet)' }}>
                    ⚡ Loading YoY subject trends database records...
                  </span>
                </div>
              ) : !trendsMatrix || !trendsMatrix.years || trendsMatrix.years.length === 0 ? (
                <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '5rem' }}>
                  No Year-over-Year trends data loaded.
                </div>
              ) : (
                <div>
                  {trendsViewMode === 'matrix' ? (
                    <div style={{ overflowX: 'auto', borderRadius: '12px', border: '1px solid var(--border-glass)', background: 'rgba(15, 23, 42, 0.2)' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'center', fontSize: '0.85rem' }}>
                        <thead>
                          <tr style={{ background: 'rgba(30, 27, 75, 0.65)', borderBottom: '2px solid var(--border-glass)' }}>
                            <th style={{ padding: '0.85rem 1.25rem', fontWeight: 700, position: 'sticky', left: 0, background: 'rgba(30, 27, 75, 0.95)', zIndex: 10, textAlign: 'left', borderRight: '1px solid var(--border-glass)' }}>
                              Year
                            </th>
                            {trendsMatrix.subjects.map(subj => (
                              <th key={subj} style={{ padding: '0.85rem 1rem', fontWeight: 600, minWidth: '130px', whiteSpace: 'nowrap', borderRight: '1px solid var(--border-glass)' }}>
                                {subj}
                              </th>
                            ))}
                            <th style={{ padding: '0.85rem 1.25rem', fontWeight: 700, background: 'rgba(30, 27, 75, 0.85)', minWidth: '120px', borderRight: '1px solid var(--border-glass)' }}>
                              Total Qs
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {trendsMatrix.years.map(yr => {
                            const total = trendsMatrix.yearStats[yr] ? trendsMatrix.yearStats[yr].total : 0;
                            return (
                              <tr key={yr} style={{ borderBottom: '1px solid var(--border-glass)', transition: 'background 0.2s' }}>
                                <td style={{ padding: '0.85rem 1.25rem', fontWeight: 700, position: 'sticky', left: 0, background: '#111024', zIndex: 10, textAlign: 'left', borderRight: '1px solid var(--border-glass)' }}>
                                  {yr}
                                </td>
                                {trendsMatrix.subjects.map(subj => {
                                  const cell = trendsMatrix.pivotData[yr][subj];
                                  const count = cell ? cell.count : 0;
                                  const pct = cell ? cell.percentage : 0;
                                  const alpha = count > 0 ? Math.min(0.28, pct / 25) : 0;
                                  const bgStyle = count > 0 ? { background: `rgba(139, 92, 246, ${alpha})` } : {};
                                  
                                  return (
                                    <td key={subj} style={{ padding: '0.85rem 1rem', borderRight: '1px solid var(--border-glass)', ...bgStyle }}>
                                      {count > 0 ? (
                                        <div>
                                          <button 
                                            onClick={() => drilldownFromTrends(subj, yr)}
                                            style={{ background: 'none', border: 'none', color: 'var(--accent-cyan)', textDecoration: 'underline', fontWeight: 700, cursor: 'pointer', fontSize: '1.05rem', padding: 0 }}
                                          >
                                            {count}
                                          </button>
                                          <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', display: 'block' }}>{pct.toFixed(1)}%</span>
                                        </div>
                                      ) : (
                                        <span style={{ color: 'rgba(255,255,255,0.1)' }}>-</span>
                                      )}
                                    </td>
                                  );
                                })}
                                <td style={{ padding: '0.85rem 1.25rem', fontWeight: 700, borderRight: '1px solid var(--border-glass)', background: 'rgba(255,255,255,0.01)' }}>
                                  {total}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div style={{ overflowX: 'auto', borderRadius: '12px', border: '1px solid var(--border-glass)' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
                        <thead>
                          <tr style={{ background: 'rgba(30, 27, 75, 0.65)', borderBottom: '2px solid var(--border-glass)' }}>
                            <th style={{ padding: '0.75rem 1.25rem', fontWeight: 600 }}>Year</th>
                            <th style={{ padding: '0.75rem 1.25rem', fontWeight: 600 }}>Subject</th>
                            <th style={{ padding: '0.75rem 1.25rem', fontWeight: 600, textAlign: 'center' }}>Number of Questions</th>
                            <th style={{ padding: '0.75rem 1.25rem', fontWeight: 600, textAlign: 'center' }}>Concentration % in Year</th>
                          </tr>
                        </thead>
                        <tbody>
                          {trendsMatrix.flatData.map((row, idx) => (
                            <tr key={idx} style={{ borderBottom: '1px solid var(--border-glass)' }} className="table-row-hover">
                              <td style={{ padding: '0.75rem 1.25rem', fontWeight: 600 }}>{row.year}</td>
                              <td style={{ padding: '0.75rem 1.25rem' }}>{row.Subject}</td>
                              <td style={{ padding: '0.75rem 1.25rem', textAlign: 'center', fontWeight: 600 }}>
                                <button 
                                  onClick={() => drilldownFromTrends(row.Subject, row.year)}
                                  style={{ background: 'none', border: 'none', color: 'var(--accent-cyan)', textDecoration: 'underline', fontWeight: 700, cursor: 'pointer', padding: 0 }}
                                >
                                  {row.count}
                                </button>
                              </td>
                              <td style={{ padding: '0.75rem 1.25rem', textAlign: 'center', color: 'var(--accent-cyan)', fontWeight: 600 }}>
                                {row.percentage.toFixed(1)}%
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Subject Distribution */}
            <div className="panel-card">
              <h3 className="panel-title" style={{ marginBottom: '1.5rem' }}><span>📊</span> Subject Frequency Distribution</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                {stats.subjects && stats.subjects.map(s => {
                  const percentage = stats.totalQuestions ? ((s.count / stats.totalQuestions) * 100).toFixed(1) : 0;
                  return (
                    <div key={s.Subject}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '0.35rem' }}>
                        <span style={{ fontWeight: 600 }}>{s.Subject}</span>
                        <span style={{ color: 'var(--text-secondary)' }}>{s.count} Qs ({percentage}%)</span>
                      </div>
                      <div style={{ background: 'rgba(255,255,255,0.03)', height: '10px', borderRadius: '99px', overflow: 'hidden' }}>
                        <div style={{ background: 'linear-gradient(90deg, var(--accent-violet), var(--accent-cyan))', height: '100%', width: `${percentage}%` }}></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {studentTab === 'progress' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            <div className="panel-card">
              <h3 className="panel-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span>📊</span> Progress Analytics &amp; Strength Profile
              </h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                Track your historical simulated scores, analyze subject accuracies, and view focus areas.
              </p>
            </div>

            {studentProgressList.length === 0 ? (
              <div className="panel-card" style={{ padding: '4rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                <span style={{ fontSize: '3rem', display: 'block', marginBottom: '1rem' }}>📈</span>
                <h4>No attempts recorded yet.</h4>
                <p style={{ fontSize: '0.85rem', marginTop: '0.5rem' }}>
                  Complete simulated exams or practice quizzes to visualize your learning trajectory.
                </p>
              </div>
            ) : (
              (() => {
                const totalAttempts = studentProgressList.length;
                const examAttempts = studentProgressList.filter(p => p.Session_Type === 'exam');
                const practiceAttempts = studentProgressList.filter(p => p.Session_Type === 'practice');
                
                let sumPercentage = 0;
                let totalCorrect = 0;
                let totalIncorrect = 0;
                let totalOmitted = 0;
                let totalDuration = 0;
                const subjectStats = {};

                studentProgressList.forEach(p => {
                  sumPercentage += (p.Score / p.Max_Score) * 100;
                  totalCorrect += p.Correct_Count;
                  totalIncorrect += p.Incorrect_Count;
                  totalOmitted += p.Omitted_Count;
                  totalDuration += p.Duration_Seconds || 0;

                  if (p.Subject_Breakdown) {
                    Object.entries(p.Subject_Breakdown).forEach(([subj, data]) => {
                      if (!subjectStats[subj]) {
                        subjectStats[subj] = { correct: 0, total: 0 };
                      }
                      subjectStats[subj].correct += data.correct || 0;
                      subjectStats[subj].total += data.total || 0;
                    });
                  }
                });

                const averageAccuracy = (totalCorrect + totalIncorrect) > 0 
                  ? ((totalCorrect / (totalCorrect + totalIncorrect)) * 100).toFixed(1)
                  : '0.0';
                const hrs = Math.floor(totalDuration / 3600);
                const mins = Math.floor((totalDuration % 3600) / 60);

                const mastered = [];
                const intermediate = [];
                const focusRequired = [];

                Object.entries(subjectStats).forEach(([subj, data]) => {
                  const accuracy = data.total > 0 ? (data.correct / data.total) * 100 : 0;
                  const item = { subject: subj, accuracy: accuracy.toFixed(1), correct: data.correct, total: data.total };
                  if (accuracy >= 80) {
                    mastered.push(item);
                  } else if (accuracy >= 50) {
                    intermediate.push(item);
                  } else {
                    focusRequired.push(item);
                  }
                });

                mastered.sort((a, b) => b.accuracy - a.accuracy);
                intermediate.sort((a, b) => b.accuracy - a.accuracy);
                focusRequired.sort((a, b) => a.accuracy - b.accuracy);

                const width = 800;
                const height = 200;
                const paddingLeft = 40;
                const paddingRight = 20;
                const paddingTop = 20;
                const paddingBottom = 30;
                const chartWidth = width - paddingLeft - paddingRight;
                const chartHeight = height - paddingTop - paddingBottom;
                const maxPossibleScore = Math.max(...studentProgressList.map(p => p.Max_Score), 100);

                const points = studentProgressList.map((p, idx) => {
                  const x = paddingLeft + (totalAttempts === 1 ? chartWidth / 2 : (idx / (totalAttempts - 1)) * chartWidth);
                  const clampedScore = Math.max(0, p.Score);
                  const y = paddingTop + chartHeight - (clampedScore / maxPossibleScore) * chartHeight;
                  return { x, y, score: p.Score, maxScore: p.Max_Score, date: new Date(p.Completed_Date).toLocaleDateString(), type: p.Session_Type };
                });

                const polylinePoints = points.map(pt => `${pt.x},${pt.y}`).join(' ');

                return (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.25rem' }}>
                      <div style={{ background: 'rgba(255,255,255,0.015)', border: '1px solid var(--border-glass)', padding: '1.5rem', borderRadius: '16px', textAlign: 'center' }}>
                        <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Mock Sessions Completed</span>
                        <span style={{ display: 'block', fontSize: '2.2rem', fontWeight: 800, color: 'var(--accent-cyan)', margin: '0.5rem 0' }}>{totalAttempts}</span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{examAttempts.length} Exams, {practiceAttempts.length} Quizzes</span>
                      </div>
                      <div style={{ background: 'rgba(255,255,255,0.015)', border: '1px solid var(--border-glass)', padding: '1.5rem', borderRadius: '16px', textAlign: 'center' }}>
                        <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Avg Accuracy Rate</span>
                        <span style={{ display: 'block', fontSize: '2.2rem', fontWeight: 800, color: 'var(--accent-violet)', margin: '0.5rem 0' }}>{averageAccuracy}%</span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Across all attempts</span>
                      </div>
                      <div style={{ background: 'rgba(255,255,255,0.015)', border: '1px solid var(--border-glass)', padding: '1.5rem', borderRadius: '16px', textAlign: 'center' }}>
                        <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Total Questions Solved</span>
                        <span style={{ display: 'block', fontSize: '2.2rem', fontWeight: 800, color: 'var(--success-emerald)', margin: '0.5rem 0' }}>{totalCorrect + totalIncorrect}</span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{totalCorrect} Correct, {totalIncorrect} Incorrect</span>
                      </div>
                      <div style={{ background: 'rgba(255,255,255,0.015)', border: '1px solid var(--border-glass)', padding: '1.5rem', borderRadius: '16px', textAlign: 'center' }}>
                        <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Time Logged on Exams</span>
                        <span style={{ display: 'block', fontSize: '2.2rem', fontWeight: 800, color: 'var(--warning-amber)', margin: '0.5rem 0' }}>{hrs}h {mins}m</span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Standard simulation runs</span>
                      </div>
                    </div>

                    <div className="panel-card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                      <h4 style={{ color: '#fff', fontSize: '1.05rem', margin: 0 }}>Score Marks Timeline Trajectory</h4>
                      <div style={{ position: 'relative', width: '100%', overflowX: 'auto', background: 'rgba(0,0,0,0.15)', padding: '1rem', borderRadius: '12px', border: '1px solid var(--border-glass)' }}>
                        <svg width={width} height={height} style={{ overflow: 'visible' }}>
                          {[0, 0.25, 0.5, 0.75, 1].map(ratio => {
                            const yVal = Math.round(maxPossibleScore * ratio);
                            const gridY = paddingTop + chartHeight - ratio * chartHeight;
                            return (
                              <g key={ratio}>
                                <line x1={paddingLeft} y1={gridY} x2={width - paddingRight} y2={gridY} stroke="rgba(255,255,255,0.05)" strokeDasharray="4 4" />
                                <text x={paddingLeft - 10} y={gridY + 4} fill="var(--text-muted)" fontSize="0.75rem" textAnchor="end">{yVal}</text>
                              </g>
                            );
                          })}

                          <polyline
                            fill="none"
                            stroke="url(#chart-gradient)"
                            strokeWidth="3"
                            points={polylinePoints}
                          />

                          {points.map((pt, idx) => (
                            <g key={idx}>
                              <circle
                                cx={pt.x}
                                cy={pt.y}
                                r="5"
                                fill={pt.type === 'exam' ? 'var(--accent-cyan)' : 'var(--accent-violet)'}
                                stroke="#111024"
                                strokeWidth="2"
                                style={{ cursor: 'pointer' }}
                              />
                              <text
                                x={pt.x}
                                y={pt.y - 12}
                                fill="#fff"
                                fontSize="0.7rem"
                                fontWeight="bold"
                                textAnchor="middle"
                              >
                                {pt.score > 0 ? `+${pt.score}` : pt.score}
                              </text>
                              <text
                                x={pt.x}
                                y={paddingTop + chartHeight + 18}
                                fill="var(--text-muted)"
                                fontSize="0.65rem"
                                textAnchor="middle"
                              >
                                {pt.date}
                              </text>
                            </g>
                          ))}

                          <defs>
                            <linearGradient id="chart-gradient" x1="0" y1="0" x2="1" y2="0">
                              <stop offset="0%" stopColor="var(--accent-violet)" />
                              <stop offset="100%" stopColor="var(--accent-cyan)" />
                            </linearGradient>
                          </defs>
                        </svg>
                      </div>
                      <div style={{ display: 'flex', gap: '1.5rem', justifyContent: 'center', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--accent-cyan)', display: 'inline-block' }}></span> Simulated Exams
                        </span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--accent-violet)', display: 'inline-block' }}></span> Practice Quizzes
                        </span>
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem' }}>
                      <div className="panel-card" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                        <h4 style={{ color: '#fff', fontSize: '1.05rem', margin: 0 }}>Subject Breakdown &amp; Mastery Levels</h4>
                        
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                          <div>
                            <span style={{ fontSize: '0.8rem', color: 'var(--success-emerald)', fontWeight: 700, display: 'block', marginBottom: '0.5rem' }}>
                              🟢 MASTERED SUBJECTS (&gt;= 80%)
                            </span>
                            {mastered.length === 0 ? (
                              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>None yet. Keep practicing!</span>
                            ) : (
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                                {mastered.map(item => (
                                  <span key={item.subject} className="badge subject" style={{ background: 'rgba(16, 185, 129, 0.12)', border: '1px solid rgba(16, 185, 129, 0.25)', color: 'var(--success-emerald)', fontSize: '0.75rem', padding: '0.35rem 0.65rem' }}>
                                    {item.subject} ({item.accuracy}%)
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>

                          <div>
                            <span style={{ fontSize: '0.8rem', color: 'var(--warning-amber)', fontWeight: 700, display: 'block', marginBottom: '0.5rem' }}>
                              🟡 INTERMEDIATE SUBJECTS (50% - 79%)
                            </span>
                            {intermediate.length === 0 ? (
                              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>None yet.</span>
                            ) : (
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                                {intermediate.map(item => (
                                  <span key={item.subject} className="badge subject" style={{ background: 'rgba(245, 158, 11, 0.12)', border: '1px solid rgba(245, 158, 11, 0.25)', color: 'var(--warning-amber)', fontSize: '0.75rem', padding: '0.35rem 0.65rem' }}>
                                    {item.subject} ({item.accuracy}%)
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>

                          <div>
                            <span style={{ fontSize: '0.8rem', color: 'var(--danger-rose)', fontWeight: 700, display: 'block', marginBottom: '0.5rem' }}>
                              🔴 FOCUS AREAS &amp; WEAKNESSES (&lt; 50%)
                            </span>
                            {focusRequired.length === 0 ? (
                              <span style={{ fontSize: '0.8rem', color: 'var(--success-emerald)', fontStyle: 'italic', fontWeight: 600 }}>All subjects are above 50%! Excellent work.</span>
                            ) : (
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                                {focusRequired.map(item => (
                                  <span key={item.subject} className="badge subject" style={{ background: 'rgba(244, 63, 94, 0.12)', border: '1px solid rgba(244, 63, 94, 0.25)', color: 'var(--danger-rose)', fontSize: '0.75rem', padding: '0.35rem 0.65rem' }}>
                                    {item.subject} ({item.accuracy}%)
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="panel-card" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                        <h4 style={{ color: '#fff', fontSize: '1.05rem', margin: 0 }}>🎯 Recommended Personal Revision Plan</h4>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                          {focusRequired.length > 0 ? (
                            <>
                              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
                                Based on your historical accuracy, we recommend prioritizing study sessions for the following subjects to boost your overall score:
                              </p>
                              {focusRequired.slice(0, 3).map((item, idx) => (
                                <div key={item.subject} style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-glass)', padding: '0.85rem 1rem', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                  <span style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--danger-rose)' }}>#{idx + 1}</span>
                                  <div style={{ flex: 1 }}>
                                    <span style={{ display: 'block', fontWeight: 600, fontSize: '0.9rem', color: '#fff' }}>{item.subject}</span>
                                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Current accuracy: {item.accuracy}% ({item.correct} of {item.total} Qs)</span>
                                  </div>
                                  <button
                                    className="btn btn-secondary"
                                    style={{ padding: '0.35rem 0.65rem', fontSize: '0.75rem' }}
                                    onClick={() => {
                                      setQuizSettings({ subject: item.subject, year: 'All', limit: 10, imagesOnly: false });
                                      window.location.hash = '#/practice';
                                      setTimeout(startQuiz, 100);
                                    }}
                                  >
                                    Practice ⚡
                                  </button>
                                </div>
                              ))}
                            </>
                          ) : (
                            <div style={{ textAlign: 'center', padding: '2rem 1rem', color: 'var(--text-secondary)' }}>
                              <span style={{ fontSize: '2.5rem', display: 'block' }}>🎉</span>
                              <h5 style={{ fontWeight: 700, marginTop: '0.5rem' }}>Mastery Achieved!</h5>
                              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                                All subjects show strong understanding. Take full-length simulations to practice time management.
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="panel-card">
                      <h4 style={{ color: '#fff', fontSize: '1.05rem', marginBottom: '1.25rem' }}>Historical Practice &amp; Exam Attempt Logs</h4>
                      <div style={{ overflowX: 'auto', borderRadius: '10px', border: '1px solid var(--border-glass)' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', textAlign: 'left' }}>
                          <thead>
                            <tr style={{ background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid var(--border-glass)' }}>
                              <th style={{ padding: '0.75rem 1rem' }}>Date Completed</th>
                              <th style={{ padding: '0.75rem 1rem' }}>Type</th>
                              <th style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>Score</th>
                              <th style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>Accuracy</th>
                              <th style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>Time Taken</th>
                            </tr>
                          </thead>
                          <tbody>
                            {[...studentProgressList].reverse().map((record) => {
                              const recordAccuracy = ((record.Score / record.Max_Score) * 100).toFixed(1);
                              const recHrs = Math.floor(record.Duration_Seconds / 3600);
                              const recMins = Math.floor((record.Duration_Seconds % 3600) / 60);
                              const recSecs = record.Duration_Seconds % 60;
                              return (
                                <tr key={record.Progress_ID || record._id} style={{ borderBottom: '1px solid var(--border-glass)' }}>
                                  <td style={{ padding: '0.75rem 1rem' }}>{new Date(record.Completed_Date).toLocaleString()}</td>
                                  <td style={{ padding: '0.75rem 1rem', textTransform: 'capitalize', fontWeight: 600 }}>
                                    {record.Session_Type === 'exam' ? 'Simulated Exam 📝' : 'Practice Quiz 📚'}
                                  </td>
                                  <td style={{ padding: '0.75rem 1rem', textAlign: 'center', fontWeight: 700, color: 'var(--accent-cyan)' }}>
                                    {record.Score} / {record.Max_Score}
                                  </td>
                                  <td style={{ padding: '0.75rem 1rem', textAlign: 'center', color: parseFloat(recordAccuracy) >= 70 ? 'var(--success-emerald)' : 'var(--warning-amber)', fontWeight: 600 }}>
                                    {recordAccuracy}%
                                  </td>
                                  <td style={{ padding: '0.75rem 1rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                                    {record.Session_Type === 'exam' ? `${recHrs}h ${recMins}m ${recSecs}s` : '--'}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </>
                );
              })()
            )}
          </div>
        )}

        {/* Detail Overlay Modal */}
        {selectedQuestion && (() => {
          const currentIdx = modalQuestionsList.findIndex(q => q.Question_ID === selectedQuestion.Question_ID);
          const isFirstQuestion = currentIdx === 0;
          const isLastQuestion = currentIdx === modalQuestionsList.length - 1;
          return (
            <div className="modal-overlay" onClick={() => setSelectedQuestion(null)}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', width: '95%', maxWidth: '1000px', justifyContent: 'center' }}>
                
                {/* Floating Prev Button */}
                <button 
                  className="modal-nav-btn" 
                  onClick={(e) => { e.stopPropagation(); navigateQuestion('prev'); }}
                  disabled={isFirstQuestion}
                  style={{
                    background: 'rgba(15, 23, 42, 0.75)',
                    border: '1px solid var(--border-glass)',
                    color: 'var(--text-primary)',
                    width: '52px',
                    height: '52px',
                    borderRadius: '99px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: isFirstQuestion ? 'not-allowed' : 'pointer',
                    opacity: isFirstQuestion ? 0.3 : 1,
                    fontSize: '1.5rem',
                    transition: 'all 0.2s ease',
                    zIndex: 1010,
                    flexShrink: 0
                  }}
                  title="Previous Question (Left Arrow)"
                >
                  ←
                </button>

                <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                  <button className="modal-close" onClick={() => setSelectedQuestion(null)}>×</button>
                  
                  <div className="modal-body">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <h3 style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>
                        Question Detail #{selectedQuestion.Question_Number}
                      </h3>
                      <span className={`badge conf-${selectedQuestion.OCR_Confidence}`} style={{ padding: '0.35rem 0.75rem', borderRadius: '8px' }}>
                        OCR Confidence: {selectedQuestion.OCR_Confidence}
                      </span>
                    </div>

                    <div style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-glass)', borderRadius: '12px', padding: '1.25rem' }}>
                      <p style={{ fontWeight: 500, fontSize: '1.05rem', lineHeight: '1.5' }}>
                        {selectedQuestion.Question_Text}
                      </p>
                    </div>

                    {/* Show actual extracted diagram if present */}
                    {(selectedQuestion.Image_Present === 1 || selectedQuestion.Image_Present === true) && (
                      <div className="image-display-container" style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '0.75rem',
                        background: 'rgba(255, 255, 255, 0.01)',
                        border: '1px solid var(--border-glass)',
                        borderRadius: '12px',
                        padding: '1.25rem',
                        margin: '1rem 0'
                      }}>
                        <div 
                          style={{ position: 'relative', cursor: 'zoom-in', width: '100%', display: 'flex', justifyContent: 'center' }}
                          onClick={() => setZoomedImage(selectedQuestion.Embedded_Image)}
                          title="Click to Zoom Diagram"
                        >
                          <img 
                            src={selectedQuestion.Embedded_Image} 
                            alt={selectedQuestion.Image_Description || "Extracted Medical Diagram"} 
                            style={{
                              maxWidth: '100%',
                              maxHeight: '380px',
                              borderRadius: '8px',
                              boxShadow: '0 4px 25px rgba(0, 0, 0, 0.5), 0 0 20px rgba(139, 92, 246, 0.2)',
                              border: '1px solid rgba(255, 255, 255, 0.08)',
                              objectFit: 'contain',
                              background: '#ffffff',
                              padding: '12px'
                            }}
                            onError={(e) => {
                              e.target.onerror = null;
                              e.target.src = "data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22100%22 height=%22100%22 viewBox=%220 0 100 100%22><rect width=%22100%22 height=%22100%22 fill=%22%230f172a%22/><text x=%2250%25%22 y=%2250%25%22 dominant-baseline=%22middle%22 text-anchor=%22middle%22 font-size=%2240%22>🖼️</text></svg>";
                            }}
                          />
                          <div className="zoom-badge-overlay">
                            🔍 Click to Zoom
                          </div>
                        </div>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                          Caption: {selectedQuestion.Image_Description || "Visual diagram extracted from PDF page"}
                        </span>
                      </div>
                    )}

                    {/* Display Multiple Choice Options in Grid */}
                    <div className="options-list">
                      <div className={`option-item ${selectedQuestion.Correct_Answer === 'A' ? 'correct' : ''}`}>
                        <span className="option-letter">A</span>
                        {renderOptionText(selectedQuestion.Option_A)}
                      </div>
                      <div className={`option-item ${selectedQuestion.Correct_Answer === 'B' ? 'correct' : ''}`}>
                        <span className="option-letter">B</span>
                        {renderOptionText(selectedQuestion.Option_B)}
                      </div>
                      <div className={`option-item ${selectedQuestion.Correct_Answer === 'C' ? 'correct' : ''}`}>
                        <span className="option-letter">C</span>
                        {renderOptionText(selectedQuestion.Option_C)}
                      </div>
                      {selectedQuestion.Option_D && selectedQuestion.Option_D.trim() !== '' && (
                        <div className={`option-item ${selectedQuestion.Correct_Answer === 'D' ? 'correct' : ''}`}>
                          <span className="option-letter">D</span>
                          {renderOptionText(selectedQuestion.Option_D)}
                        </div>
                      )}
                    </div>

                    {/* Display Clinical Explanation */}
                    {selectedQuestion.Answer_Explanation && (
                      <div className="explanation-box" style={
                        selectedQuestion.Answer_Explanation.startsWith('[AI Explanation Pending]')
                          ? { background: 'rgba(245, 158, 11, 0.08)', border: '1px solid rgba(245, 158, 11, 0.3)', borderRadius: '8px', padding: '1rem' }
                          : {}
                      }>
                        <h4 style={{ fontFamily: 'var(--font-display)', color: 'var(--accent-violet)', marginBottom: '0.5rem', fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          {selectedQuestion.Answer_Explanation.startsWith('[AI Explanation Pending]')
                            ? <span>⏳ AI Explanation Pending</span>
                            : <span>Clinical Rationale &amp; Answer Explanation</span>
                          }
                        </h4>
                        <p style={{ fontSize: '0.85rem', color: selectedQuestion.Answer_Explanation.startsWith('[AI Explanation Pending]') ? 'rgba(245, 158, 11, 0.9)' : 'var(--text-secondary)', lineHeight: '1.6' }}>
                          {selectedQuestion.Answer_Explanation.startsWith('[AI Explanation Pending]')
                            ? selectedQuestion.Answer_Explanation.replace('[AI Explanation Pending] ', '')
                            : selectedQuestion.Answer_Explanation
                          }
                        </p>
                      </div>
                    )}

                    {/* Metadata Badges Footer */}
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', paddingTop: '1rem', borderTop: '1px solid var(--border-glass)' }}>
                      <span className="badge subject">Subject: {selectedQuestion.Subject}</span>
                      <span className="badge subject" style={{ background: 'rgba(6, 182, 212, 0.15)', color: '#22d3ee' }}>
                        Chapter: {selectedQuestion.Chapter}
                      </span>
                      <span className="badge difficulty">Difficulty: {selectedQuestion.Difficulty_Level}</span>
                      <span className="badge difficulty" style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#34d399' }}>
                        Domain: {selectedQuestion.Clinical_or_Conceptual}
                      </span>
                      <span className="badge" style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--text-primary)' }}>
                        Year: {selectedQuestion.Previous_Year}
                      </span>
                      <span className="badge" style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--text-primary)' }}>
                        Page: {selectedQuestion.Page_Number}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Floating Next Button */}
                <button 
                  className="modal-nav-btn" 
                  onClick={(e) => { e.stopPropagation(); navigateQuestion('next'); }}
                  disabled={isLastQuestion}
                  style={{
                    background: 'rgba(15, 23, 42, 0.75)',
                    border: '1px solid var(--border-glass)',
                    color: 'var(--text-primary)',
                    width: '52px',
                    height: '52px',
                    borderRadius: '99px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: isLastQuestion ? 'not-allowed' : 'pointer',
                    opacity: isLastQuestion ? 0.3 : 1,
                    fontSize: '1.5rem',
                    transition: 'all 0.2s ease',
                    zIndex: 1010,
                    flexShrink: 0
                  }}
                  title="Next Question (Right Arrow)"
                >
                  →
                </button>

              </div>
            </div>
          );
        })()}

        {/* Zoomed Image Overlay Modal */}
        {zoomedImage && (
          <div className="zoom-overlay" onClick={() => setZoomedImage(null)}>
            <button className="zoom-close" onClick={() => setZoomedImage(null)}>×</button>
            <div className="zoom-content" onClick={(e) => e.stopPropagation()}>
              <img 
                src={zoomedImage} 
                alt="Zoomed Medical Diagram" 
                className="zoom-image"
                onError={(e) => {
                  e.target.onerror = null;
                  e.target.src = "data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22100%22 height=%22100%22 viewBox=%220 0 100 100%22><rect width=%22100%22 height=%22100%22 fill=%22%230f172a%22/><text x=%2250%25%22 y=%2250%25%22 dominant-baseline=%22middle%22 text-anchor=%22middle%22 font-size=%2240%22>🖼️</text></svg>";
                }}
              />
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="app-container">
      {/* Header Bar */}
      <header className="header" style={{ position: 'relative' }}>
        <div className="header-logo">
          <div className="logo-badge">🩺</div>
          <div>
            <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.4rem' }}>
              NEET PG Ingestion Console
            </h2>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
              High-Fidelity Paper Parsing System
            </span>
          </div>
        </div>

        <button 
          className={`hamburger-menu ${mobileMenuOpen ? 'open' : ''}`} 
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          aria-label="Toggle menu"
        >
          <span className="hamburger-line"></span>
          <span className="hamburger-line"></span>
          <span className="hamburger-line"></span>
        </button>
        
        <div className={`header-nav-container ${mobileMenuOpen ? 'mobile-open' : ''}`}>
          <nav className="nav-tabs">
            <button 
              className={`nav-tab ${activeTab === 'dashboard' ? 'active' : ''}`}
              onClick={() => window.location.hash = '#/dashboard'}
            >
              Dashboard
            </button>
            <button 
              className={`nav-tab ${activeTab === 'questions' ? 'active' : ''}`}
              onClick={() => window.location.hash = '#/question-bank'}
            >
              Question Bank
            </button>
            <button 
              className={`nav-tab ${activeTab === 'analytics' ? 'active' : ''}`}
              onClick={() => window.location.hash = '#/trends'}
            >
              Trend Hub
            </button>
            <button 
              className={`nav-tab ${activeTab === 'settings' ? 'active' : ''}`}
              onClick={() => window.location.hash = '#/console'}
            >
              System Console
            </button>
            <button 
              className="nav-tab"
              onClick={handleOpenSettings}
              style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}
              title="Configure System Settings"
            >
              ⚙️ Settings
            </button>
          </nav>

          {userProfile && (
            <div className="user-profile-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                {userProfile.picture ? (
                  <img 
                    src={userProfile.picture} 
                    alt={userProfile.name} 
                    style={{ width: '32px', height: '32px', borderRadius: '50%', border: '1.5px solid var(--accent-cyan)' }}
                  />
                ) : (
                  <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'var(--accent-violet)', display: 'flex', justifyContent: 'center', alignItems: 'center', fontWeight: 'bold', fontSize: '0.85rem' }}>
                    {userProfile.name.charAt(0)}
                  </div>
                )}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#fff', lineHeight: '1.2' }}>{userProfile.name}</span>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{userProfile.email}</span>
                </div>
              </div>
              <button 
                onClick={handleLogout}
                style={{ background: 'rgba(255, 107, 107, 0.1)', border: '1px solid rgba(255, 107, 107, 0.2)', color: '#ff6b6b', padding: '0.35rem 0.75rem', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s' }}
                onMouseEnter={(e) => { e.target.style.background = 'rgba(255, 107, 107, 0.2)'; }}
                onMouseLeave={(e) => { e.target.style.background = 'rgba(255, 107, 107, 0.1)'; }}
              >
                Sign Out
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Global Stat Indicators */}
      <section className="stats-strip">
        <div className="stat-box purple">
          <span className="stat-label">Total Bank Database</span>
          <div className="stat-value">
            {stats.totalQuestions || 0} <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Items</span>
          </div>
        </div>
        <div className="stat-box cyan">
          <span className="stat-label">Subject Categories</span>
          <div className="stat-value">
            {stats.subjects ? stats.subjects.length : 0} <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Groups</span>
          </div>
        </div>
        <div className="stat-box emerald">
          <span className="stat-label">Image-based Items</span>
          <div className="stat-value">
            {stats.imageCount || 0} <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Diagrams</span>
          </div>
        </div>
        <div className="stat-box amber">
          <span className="stat-label">Ingested Files</span>
          <div className="stat-value">
            {uploadHistory.length} <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>PDFs</span>
          </div>
        </div>
      </section>

      {/* TAB CONTENTS */}
      
      {/* 1. DASHBOARD */}
      {activeTab === 'dashboard' && (
        <div className="dashboard-grid">
          {/* Ingestion Engine Card */}
          <div className="panel-card">
            <div className="panel-header">
              <h3 className="panel-title"><span>📂</span> Ingestion Control Room</h3>
              <span className="status-badge completed" style={{ fontSize: '0.65rem' }}>Active</span>
            </div>
            
            <div 
              className={`dropzone ${dragActive ? 'active' : ''}`}
              onDragEnter={handleDrag}
              onDragOver={handleDrag}
              onDragLeave={handleDrag}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current.click()}
            >
              <input 
                ref={fileInputRef}
                type="file" 
                multiple 
                accept=".pdf" 
                style={{ display: 'none' }}
                onChange={handleFileChange}
              />
              <span className="dropzone-icon">📥</span>
              <h4 style={{ fontFamily: 'var(--font-display)', marginBottom: '0.5rem' }}>
                Drag & Drop NEET PG papers here
              </h4>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '1.25rem' }}>
                Supports multiple uploads. High fidelity PDF extraction up to 1GB.
              </p>
              <button className="btn btn-secondary" onClick={(e) => { e.stopPropagation(); fileInputRef.current.click(); }}>
                Browse Files
              </button>
            </div>

            {isUploading && (
              <div style={{ marginTop: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '0.25rem' }}>
                  <span>Uploading files...</span>
                  <span>{uploadProgress}%</span>
                </div>
                <div style={{ background: 'rgba(255,255,255,0.05)', height: '6px', borderRadius: '99px', overflow: 'hidden' }}>
                  <div style={{ background: 'var(--accent-cyan)', height: '100%', width: `${uploadProgress}%`, transition: 'width 0.2s ease' }}></div>
                </div>
              </div>
            )}
          </div>

          {/* Active Job Tracker */}
          <div className="panel-card">
            <div className="panel-header">
              <h3 className="panel-title"><span>🔄</span> Active Processing Queues</h3>
              <button 
                className="btn btn-cyan" 
                style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
                onClick={() => triggerExcelDownload()}
                disabled={stats.totalQuestions === 0}
              >
                📥 Export Combined Excel
              </button>
            </div>

            <div className="queue-list">
              {uploadHistory.length === 0 ? (
                <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '3rem' }}>
                  <span>📭 No papers uploaded yet</span>
                </div>
              ) : (
                uploadHistory.map(up => (
                  <div key={up.Upload_ID} className="queue-item">
                    <div className="queue-info">
                      <span className="queue-name">{up.File_Name}</span>
                      <div className="queue-meta">
                        <span>{formatBytes(up.File_Size)}</span>
                        <span>•</span>
                        <span>{formatDate(up.Upload_Date)}</span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      {up.Processing_Status === 'COMPLETED' && (
                        <span style={{ fontSize: '0.8rem', color: 'var(--success-emerald)', fontWeight: 600 }}>
                          +{up.Questions_Extracted} Qs
                        </span>
                      )}
                      <span className={`status-badge ${up.Processing_Status.toLowerCase()}`}>
                        {up.Processing_Status === 'PROCESSING' && '⏳ '}
                        {up.Processing_Status === 'FAILED' && '❌ '}
                        {up.Processing_Status}
                      </span>
                      {up.Processing_Status === 'FAILED' && (
                        <button
                          className="btn-secondary"
                          style={{ border: 'none', background: 'rgba(245,158,11,0.1)', borderRadius: '6px', padding: '0.35rem 0.6rem', cursor: 'pointer', color: 'var(--warning-amber)', fontSize: '0.75rem', fontWeight: 600 }}
                          onClick={() => triggerFileProcessing(up.Upload_ID)}
                          title="Retry processing this PDF"
                        >
                          🔄 Retry
                        </button>
                      )}
                      {up.Processing_Status === 'COMPLETED' && (
                        <button 
                          className="btn-secondary" 
                          style={{ border: 'none', background: 'rgba(255,255,255,0.04)', borderRadius: '6px', padding: '0.35rem 0.6rem', cursor: 'pointer', color: 'var(--text-primary)' }}
                          onClick={() => triggerExcelDownload(up.Upload_ID)}
                          title="Download Excel for this Paper"
                        >
                          📥
                        </button>
                      )}
                      <button 
                        className="btn-secondary" 
                        style={{ border: 'none', background: 'rgba(244,63,94,0.1)', borderRadius: '6px', padding: '0.35rem 0.6rem', cursor: 'pointer', color: 'var(--danger-rose)' }}
                        onClick={(e) => deleteUpload(up.Upload_ID, e)}
                        title="Delete Upload Package & Ingested Questions"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>

                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* 2. QUESTION BANK */}
      {activeTab === 'questions' && (
        <div className="panel-card" style={{ minHeight: '500px' }}>
          <div className="panel-header">
            <h3 className="panel-title"><span>📂</span> Question Repository Grid</h3>
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
              <button 
                className="btn btn-secondary" 
                style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem', background: layoutMode === 'grid' ? 'rgba(139, 92, 246, 0.15)' : 'rgba(255,255,255,0.02)', color: layoutMode === 'grid' ? 'var(--text-primary)' : 'var(--text-secondary)', border: '1px solid var(--border-glass)', borderRadius: '8px', cursor: 'pointer' }}
                onClick={() => setLayoutMode('grid')}
              >
                🎴 Card View
              </button>
              <button 
                className="btn btn-secondary" 
                style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem', background: layoutMode === 'table' ? 'rgba(139, 92, 246, 0.15)' : 'rgba(255,255,255,0.02)', color: layoutMode === 'table' ? 'var(--text-primary)' : 'var(--text-secondary)', border: '1px solid var(--border-glass)', borderRadius: '8px', cursor: 'pointer' }}
                onClick={() => setLayoutMode('table')}
              >
                📋 Compact Table
              </button>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginLeft: '0.5rem' }}>
                Showing {questions.length} of {totalQuestions} questions
              </span>
            </div>
          </div>

          {/* Dynamic Filter Row */}
          <div className="filter-bar" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.75rem', marginBottom: '1.5rem' }}>
            <input 
              type="text" 
              className="form-control"
              placeholder="🔍 Search symptoms, diagnoses, keywords..."
              value={searchTerm}
              onChange={(e) => { setSearchTerm(e.target.value); setPage(1); }}
            />
            
            <select 
              className="form-control"
              value={subjectFilter}
              onChange={(e) => { setSubjectFilter(e.target.value); setPage(1); }}
            >
              <option value="All">All Subjects</option>
              {stats.subjects && stats.subjects.map(s => (
                <option key={s.Subject} value={s.Subject}>{s.Subject} ({s.count})</option>
              ))}
            </select>

            <select 
              className="form-control"
              value={difficultyFilter}
              onChange={(e) => { setDifficultyFilter(e.target.value); setPage(1); }}
            >
              <option value="All">All Difficulties</option>
              <option value="Easy">Easy</option>
              <option value="Medium">Medium</option>
              <option value="Hard">Hard</option>
            </select>

            <select 
              className="form-control"
              value={imageFilter}
              onChange={(e) => { setImageFilter(e.target.value); setPage(1); }}
            >
              <option value="All">All Images</option>
              <option value="Yes">With Images</option>
              <option value="No">Without Images</option>
            </select>

            <select 
              className="form-control"
              value={yearFilter}
              onChange={(e) => { setYearFilter(e.target.value); setPage(1); }}
            >
              <option value="All">All Years</option>
              {stats.years && stats.years.map(y => (
                <option key={y.year} value={y.year}>{y.year} ({y.count})</option>
              ))}
            </select>

            <select 
              className="form-control"
              value={uploadFilter}
              onChange={(e) => { setUploadFilter(e.target.value); setPage(1); }}
            >
              <option value="All">All Uploaded Files</option>
              {stats.uploads && stats.uploads.map(u => (
                <option key={u.uploadId} value={u.uploadId}>{u.fileName}</option>
              ))}
            </select>

            <select 
              className="form-control"
              value={itemsPerPage}
              onChange={(e) => { setItemsPerPage(parseInt(e.target.value)); setPage(1); }}
            >
              <option value={25}>25 per page</option>
              <option value={50}>50 per page</option>
              <option value={75}>75 per page</option>
              <option value={100}>100 per page</option>
            </select>

            <button 
              className="btn btn-cyan"
              style={{ display: 'flex', justifyContent: 'center' }}
              onClick={() => triggerExcelDownload()}
              disabled={questions.length === 0}
            >
              📥 Download Excel
            </button>

            <button 
              className="btn btn-primary"
              style={{ display: 'flex', justifyContent: 'center', background: 'linear-gradient(135deg, #a855f7 0%, #d946ef 100%)', border: 'none' }}
              onClick={() => triggerBatchEnrichment()}
            >
              ✨ Enrich Pending
            </button>
          </div>

          {/* Core Questions Renderer */}
          {questions.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '5rem' }}>
              <span>🔍 No questions matching current filter constraints</span>
            </div>
          ) : (
            <>
              {layoutMode === 'table' ? (
                <div style={{ overflowX: 'auto', background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-glass)', borderRadius: '12px', marginBottom: '1.5rem' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
                    <thead>
                      <tr style={{ background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid var(--border-glass)' }}>
                        <th style={{ padding: '0.85rem 1rem', fontWeight: 600 }}>Q No</th>
                        <th style={{ padding: '0.85rem 1rem', fontWeight: 600 }}>Subject</th>
                        <th style={{ padding: '0.85rem 1rem', fontWeight: 600 }}>Question Text</th>
                        <th style={{ padding: '0.85rem 1rem', fontWeight: 600 }}>Difficulty</th>
                        <th style={{ padding: '0.85rem 1rem', fontWeight: 600 }}>Confidence</th>
                        <th style={{ padding: '0.85rem 1rem', fontWeight: 600, textAlign: 'center' }}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {questions.map(q => (
                        <tr 
                          key={q.Question_ID} 
                          onClick={() => viewQuestionDetails(q.Question_ID)}
                          style={{ borderBottom: '1px solid var(--border-glass)', cursor: 'pointer', transition: 'background 0.2s' }}
                          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.02)'}
                          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                        >
                          <td style={{ padding: '0.85rem 1rem', fontWeight: 700, color: 'var(--text-muted)' }}>{q.Question_Number}</td>
                          <td style={{ padding: '0.85rem 1rem' }}>
                            <span className="badge subject">{q.Subject}</span>
                          </td>
                          <td style={{ padding: '0.85rem 1rem', maxWidth: '420px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {q.Question_Text}
                          </td>
                          <td style={{ padding: '0.85rem 1rem' }}>
                            <span className="badge difficulty">{q.Difficulty_Level}</span>
                          </td>
                          <td style={{ padding: '0.85rem 1rem' }}>
                            <span className={`badge conf-${q.OCR_Confidence}`}>OCR {q.OCR_Confidence}</span>
                          </td>
                          <td style={{ padding: '0.85rem 1rem', textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                            <button 
                              className="btn-secondary"
                              style={{ border: 'none', background: 'rgba(244,63,94,0.1)', borderRadius: '6px', padding: '0.35rem 0.5rem', cursor: 'pointer', color: 'var(--danger-rose)' }}
                              onClick={(e) => deleteQuestion(q.Question_ID, e)}
                              title="Delete Question"
                            >
                              🗑️
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="questions-grid">
                  {questions.map(q => (
                    <div key={q.Question_ID} className="question-card" onClick={() => viewQuestionDetails(q.Question_ID)}>
                      <div className="q-card-header">
                        <span className="q-num">Q. {q.Question_Number}</span>
                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }} onClick={(e) => e.stopPropagation()}>
                          <span className={`badge conf-${q.OCR_Confidence}`}>
                            OCR {q.OCR_Confidence}
                          </span>
                          <button 
                            className="btn-secondary"
                            style={{ border: 'none', background: 'rgba(244,63,94,0.15)', borderRadius: '4px', padding: '0.2rem 0.35rem', cursor: 'pointer', color: 'var(--danger-rose)', fontSize: '0.75rem' }}
                            onClick={(e) => deleteQuestion(q.Question_ID, e)}
                            title="Delete Question"
                          >
                            🗑️
                          </button>
                        </div>
                      </div>
                      
                      <p className="q-text">{q.Question_Text}</p>
                      
                      <div className="q-footer">
                        <span className="badge subject">{q.Subject}</span>
                        <span className="badge difficulty">{q.Difficulty_Level}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Simple Pagination Footer */}
              <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', marginTop: '2rem', alignItems: 'center' }}>
                <button 
                  className="btn btn-secondary" 
                  style={{ padding: '0.4rem 1rem' }}
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                >
                  Previous
                </button>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  Page {page} of {Math.ceil(totalQuestions / itemsPerPage) || 1}
                </span>
                <button 
                  className="btn btn-secondary" 
                  style={{ padding: '0.4rem 1rem' }}
                  onClick={() => setPage(p => p + 1)}
                  disabled={page >= Math.ceil(totalQuestions / itemsPerPage)}
                >
                  Next
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* 3. TRENDS & ANALYTICS */}
      {activeTab === 'analytics' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          
          {/* YoY Trends Section */}
          <div className="panel-card" style={{ width: '100%', padding: '1.75rem', overflow: 'hidden' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--border-glass)', paddingBottom: '1.25rem' }}>
              <div>
                <h3 className="panel-title" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span>📈</span> Year-over-Year (YoY) Subject Analytics Matrix
                </h3>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                  Analyze how many questions from each subject appeared in specific years and examine subject concentration heatmaps.
                </p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                {/* View Switcher Toggle */}
                <div style={{ display: 'flex', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-glass)', borderRadius: '8px', padding: '2px' }}>
                  <button 
                    className={`btn ${trendsViewMode === 'matrix' ? 'btn-primary' : ''}`}
                    style={{ padding: '0.35rem 0.85rem', fontSize: '0.8rem', border: 'none', borderRadius: '6px', background: trendsViewMode === 'matrix' ? '' : 'transparent' }}
                    onClick={() => setTrendsViewMode('matrix')}
                  >
                    📊 Matrix Grid
                  </button>
                  <button 
                    className={`btn ${trendsViewMode === 'flat' ? 'btn-primary' : ''}`}
                    style={{ padding: '0.35rem 0.85rem', fontSize: '0.8rem', border: 'none', borderRadius: '6px', background: trendsViewMode === 'flat' ? '' : 'transparent' }}
                    onClick={() => setTrendsViewMode('flat')}
                  >
                    📋 Flat List
                  </button>
                </div>
                {/* Export Button */}
                <button 
                  className="btn btn-primary"
                  style={{
                    padding: '0.45rem 1rem',
                    fontSize: '0.85rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    background: 'linear-gradient(135deg, var(--accent-violet), #4f46e5)',
                    boxShadow: '0 4px 15px rgba(139, 92, 246, 0.3)'
                  }}
                  onClick={() => window.open('/api/trends/downloadExcel', '_blank')}
                  disabled={!trendsMatrix || !trendsMatrix.years || trendsMatrix.years.length === 0}
                >
                  📥 Export Trends to Excel
                </button>
              </div>
            </div>

            {trendsLoading ? (
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '5rem' }}>
                <span className="pulse-glow" style={{ display: 'inline-block', fontSize: '1.25rem', color: 'var(--accent-violet)', animation: 'pulseGlow 1.5s infinite' }}>
                  ⚡ Loading YoY subject trends database records...
                </span>
              </div>
            ) : !trendsMatrix || !trendsMatrix.years || trendsMatrix.years.length === 0 ? (
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '5rem' }}>
                No Year-over-Year trends data loaded. Ingest papers with dynamic years to visualize.
              </div>
            ) : (
              <div>
                {trendsViewMode === 'matrix' ? (
                  /* Pivot Matrix Grid View with horizontal scrolling and sticky Year column */
                  <div style={{ overflowX: 'auto', borderRadius: '12px', border: '1px solid var(--border-glass)', background: 'rgba(15, 23, 42, 0.2)' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'center', fontSize: '0.85rem' }}>
                      <thead>
                        <tr style={{ background: 'rgba(30, 27, 75, 0.65)', borderBottom: '2px solid var(--border-glass)' }}>
                          <th style={{ padding: '0.85rem 1.25rem', fontWeight: 700, position: 'sticky', left: 0, background: 'rgba(30, 27, 75, 0.95)', zIndex: 10, textAlign: 'left', borderRight: '1px solid var(--border-glass)' }}>
                            Year
                          </th>
                          {trendsMatrix.subjects.map(subj => (
                            <th key={subj} style={{ padding: '0.85rem 1rem', fontWeight: 600, minWidth: '130px', whiteSpace: 'nowrap', borderRight: '1px solid var(--border-glass)' }}>
                              {subj}
                            </th>
                          ))}
                          <th style={{ padding: '0.85rem 1.25rem', fontWeight: 700, background: 'rgba(30, 27, 75, 0.85)', minWidth: '120px', borderRight: '1px solid var(--border-glass)' }}>
                            Total Qs
                          </th>
                          <th style={{ padding: '0.85rem 1.25rem', fontWeight: 700, background: 'rgba(30, 27, 75, 0.85)', minWidth: '160px', borderRight: '1px solid var(--border-glass)' }}>
                            Image Qs (%)
                          </th>
                          <th style={{ padding: '0.85rem 1.25rem', fontWeight: 700, background: 'rgba(30, 27, 75, 0.85)', minWidth: '160px' }}>
                            Clinical Scenario Qs (%)
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {trendsMatrix.years.map(yr => {
                          const stats = trendsMatrix.yearStats[yr] || { total: 0, imageCount: 0, imagePercentage: 0, clinicalCount: 0, clinicalPercentage: 0 };
                          return (
                            <tr key={yr} style={{ borderBottom: '1px solid var(--border-glass)', transition: 'background 0.2s' }}>
                              <td style={{ padding: '0.85rem 1.25rem', fontWeight: 700, position: 'sticky', left: 0, background: '#111024', zIndex: 10, textAlign: 'left', borderRight: '1px solid var(--border-glass)' }}>
                                {yr}
                              </td>
                              {trendsMatrix.subjects.map(subj => {
                                const cell = trendsMatrix.pivotData[yr][subj];
                                const count = cell ? cell.count : 0;
                                const pct = cell ? cell.percentage : 0;
                                
                                // Heatmap opacity styling
                                const alpha = count > 0 ? Math.min(0.28, pct / 25) : 0;
                                const bgStyle = count > 0 ? { background: `rgba(139, 92, 246, ${alpha})` } : {};
                                
                                return (
                                  <td key={subj} style={{ padding: '0.85rem 1rem', borderRight: '1px solid var(--border-glass)', ...bgStyle }}>
                                    {count > 0 ? (
                                      <div>
                                        <button 
                                          onClick={() => drilldownFromTrends(subj, yr)}
                                          className="trend-drilldown-link"
                                          style={{
                                            background: 'none',
                                            border: 'none',
                                            color: 'var(--accent-cyan)',
                                            textDecoration: 'underline',
                                            fontWeight: 700,
                                            cursor: 'pointer',
                                            fontSize: '1.05rem',
                                            padding: 0,
                                            display: 'inline-block'
                                          }}
                                          title={`Click to view ${count} ${subj} questions from ${yr}`}
                                        >
                                          {count}
                                        </button>
                                        <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', display: 'block' }}>{pct.toFixed(1)}%</span>
                                      </div>
                                    ) : (
                                      <span style={{ color: 'rgba(255,255,255,0.1)' }}>-</span>
                                    )}
                                  </td>
                                );
                              })}
                              <td style={{ padding: '0.85rem 1.25rem', fontWeight: 700, borderRight: '1px solid var(--border-glass)', background: 'rgba(255,255,255,0.01)', fontSize: '0.95rem' }}>
                                {stats.total}
                              </td>
                              <td style={{ padding: '0.85rem 1.25rem', borderRight: '1px solid var(--border-glass)', background: 'rgba(255,255,255,0.01)' }}>
                                <span style={{ fontWeight: 600, display: 'block' }}>{stats.imageCount}</span>
                                <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{stats.imagePercentage.toFixed(1)}%</span>
                              </td>
                              <td style={{ padding: '0.85rem 1.25rem', background: 'rgba(255,255,255,0.01)' }}>
                                <span style={{ fontWeight: 600, display: 'block' }}>{stats.clinicalCount}</span>
                                <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{stats.clinicalPercentage.toFixed(1)}%</span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  /* Dynamic flat view table */
                  <div style={{ overflowX: 'auto', borderRadius: '12px', border: '1px solid var(--border-glass)' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
                      <thead>
                        <tr style={{ background: 'rgba(30, 27, 75, 0.65)', borderBottom: '2px solid var(--border-glass)' }}>
                          <th style={{ padding: '0.75rem 1.25rem', fontWeight: 600 }}>Year</th>
                          <th style={{ padding: '0.75rem 1.25rem', fontWeight: 600 }}>Subject</th>
                          <th style={{ padding: '0.75rem 1.25rem', fontWeight: 600, textAlign: 'center' }}>Number of Questions</th>
                          <th style={{ padding: '0.75rem 1.25rem', fontWeight: 600, textAlign: 'center' }}>Concentration % in Year</th>
                        </tr>
                      </thead>
                      <tbody>
                        {trendsMatrix.flatData.map((row, idx) => (
                          <tr key={idx} style={{ borderBottom: '1px solid var(--border-glass)' }} className="table-row-hover">
                            <td style={{ padding: '0.75rem 1.25rem', fontWeight: 600 }}>{row.year}</td>
                            <td style={{ padding: '0.75rem 1.25rem' }}>{row.Subject}</td>
                            <td style={{ padding: '0.75rem 1.25rem', textAlign: 'center', fontWeight: 600 }}>
                              <button 
                                onClick={() => drilldownFromTrends(row.Subject, row.year)}
                                style={{ background: 'none', border: 'none', color: 'var(--accent-cyan)', textDecoration: 'underline', fontWeight: 700, cursor: 'pointer', padding: 0 }}
                              >
                                {row.count}
                              </button>
                            </td>
                            <td style={{ padding: '0.75rem 1.25rem', textAlign: 'center', color: 'var(--accent-cyan)', fontWeight: 600 }}>
                              {row.percentage.toFixed(1)}%
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="dashboard-grid" style={{ width: '100%' }}>
            {/* Subject Frequency Panel */}
            <div className="panel-card">
              <h3 className="panel-title" style={{ marginBottom: '1.5rem' }}><span>📊</span> Subject Frequency Distribution</h3>
              {stats.totalQuestions === 0 ? (
                <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '5rem' }}>
                  No database metrics loaded. Ingest papers to visualize trends.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                  {stats.subjects && stats.subjects.map(s => {
                    const percentage = stats.totalQuestions ? ((s.count / stats.totalQuestions) * 100).toFixed(1) : 0;
                    return (
                      <div key={s.Subject}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '0.35rem' }}>
                          <span style={{ fontWeight: 600 }}>{s.Subject}</span>
                          <span style={{ color: 'var(--text-secondary)' }}>{s.count} Qs ({percentage}%)</span>
                        </div>
                        <div style={{ background: 'rgba(255,255,255,0.03)', height: '10px', borderRadius: '99px', overflow: 'hidden' }}>
                          <div style={{ background: 'linear-gradient(90deg, var(--accent-violet), var(--accent-cyan))', height: '100%', width: `${percentage}%` }}></div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Chapter Density & 2026 Predictions */}
            <div className="panel-card">
              <h3 className="panel-title" style={{ marginBottom: '1.5rem' }}><span>🔮</span> NEET PG 2026 Prediction Model</h3>
              <div style={{ background: 'rgba(139, 92, 246, 0.05)', border: '1px solid rgba(139, 92, 246, 0.2)', padding: '1.25rem', borderRadius: '12px', marginBottom: '1.5rem' }}>
                <h4 style={{ fontFamily: 'var(--font-display)', color: 'var(--accent-violet)', marginBottom: '0.5rem' }}>
                  High-Yield Probability Matrix
                </h4>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  Based on historical trend algorithms, repeated clinical indicators, and curriculum weight ratios, our engine predicts high probability trends for NEET PG 2026.
                </p>
              </div>

              {stats.totalQuestions === 0 ? (
                <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '3rem' }}>
                  Database metrics are currently empty.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem', borderBottom: '1px solid var(--border-glass)' }}>
                    <div>
                      <span style={{ display: 'block', fontWeight: 600, fontSize: '0.9rem' }}>Cardiology: Acute Coronary Syndrome</span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Focus on ECG mappings & coronary occlusion indicators</span>
                    </div>
                    <span className="status-badge completed" style={{ background: 'rgba(16, 185, 129, 0.15)', color: 'var(--success-emerald)' }}>94% Yield</span>
                  </div>
                  
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem', borderBottom: '1px solid var(--border-glass)' }}>
                    <div>
                      <span style={{ display: 'block', fontWeight: 600, fontSize: '0.9rem' }}>Endocrine Pathology: Thyroid Swellings</span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Focus on histological features (Hurthle cells, follicles)</span>
                    </div>
                    <span className="status-badge completed" style={{ background: 'rgba(16, 185, 129, 0.15)', color: 'var(--success-emerald)' }}>88% Yield</span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem', borderBottom: '1px solid var(--border-glass)' }}>
                    <div>
                      <span style={{ display: 'block', fontWeight: 600, fontSize: '0.9rem' }}>Neonatology: Infant Distress</span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Focus on radiograph (RDS ground-glass granules)</span>
                    </div>
                    <span className="status-badge pending" style={{ background: 'rgba(245, 158, 11, 0.15)', color: 'var(--warning-amber)' }}>76% Yield</span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem' }}>
                    <div>
                      <span style={{ display: 'block', fontWeight: 600, fontSize: '0.9rem' }}>NSAIDs: Cox Enzymes Inhibition</span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Irreversible binding properties of Aspirin</span>
                    </div>
                    <span className="status-badge pending" style={{ background: 'rgba(245, 158, 11, 0.15)', color: 'var(--warning-amber)' }}>69% Yield</span>
                  </div>
                </div>
              )}
            </div>
          </div>

        </div>
      )}

      {/* 4. SYSTEM LOGS & SETTINGS */}
      {activeTab === 'settings' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          {/* Live system logs */}
          <div className="panel-card">
            <div className="panel-header">
              <h3 className="panel-title"><span>💻</span> System Execution Console</h3>
              <span className="status-badge processing" style={{ fontSize: '0.65rem' }}>Streaming Live</span>
            </div>
            
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
              Monitors document parser bounds, visual image extractions, cleaning regular expressions, and SQLite ingestion transaction times.
            </p>

            <div className="logs-console">
              {logs.length === 0 ? (
                <div style={{ color: 'var(--text-muted)' }}>System logs are currently empty. Awaiting jobs...</div>
              ) : (
                logs.map((line, index) => {
                  let cl = 'info';
                  if (line.includes('[WARN]')) cl = 'warn';
                  else if (line.includes('[ERROR]')) cl = 'error';
                  
                  return (
                    <div key={index} className={`log-line ${cl}`}>
                      {line}
                    </div>
                  );
                })
              )}
              <div ref={logsEndRef} />
            </div>
          </div>
        </div>
      )}

      {/* Detail Overlay Modal */}
      {selectedQuestion && (() => {
        const currentIdx = modalQuestionsList.findIndex(q => q.Question_ID === selectedQuestion.Question_ID);
        const isFirstQuestion = currentIdx === 0;
        const isLastQuestion = currentIdx === modalQuestionsList.length - 1;
        return (
          <div className="modal-overlay" onClick={() => setSelectedQuestion(null)}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', width: '95%', maxWidth: '1000px', justifyContent: 'center' }}>
              
              {/* Floating Prev Button */}
              <button 
                className="modal-nav-btn" 
                onClick={(e) => { e.stopPropagation(); navigateQuestion('prev'); }}
                disabled={isFirstQuestion}
                style={{
                  background: 'rgba(15, 23, 42, 0.75)',
                  border: '1px solid var(--border-glass)',
                  color: 'var(--text-primary)',
                  width: '52px',
                  height: '52px',
                  borderRadius: '99px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: isFirstQuestion ? 'not-allowed' : 'pointer',
                  opacity: isFirstQuestion ? 0.3 : 1,
                  fontSize: '1.5rem',
                  transition: 'all 0.2s ease',
                  zIndex: 1010,
                  flexShrink: 0
                }}
                title="Previous Question (Left Arrow)"
              >
                ←
              </button>

              <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                <button className="modal-close" onClick={() => setSelectedQuestion(null)}>×</button>
                
                <div className="modal-body">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>
                      Question Detail #{selectedQuestion.Question_Number}
                    </h3>
                    <span className={`badge conf-${selectedQuestion.OCR_Confidence}`} style={{ padding: '0.35rem 0.75rem', borderRadius: '8px' }}>
                      OCR Confidence: {selectedQuestion.OCR_Confidence}
                    </span>
                  </div>

                  <div style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-glass)', borderRadius: '12px', padding: '1.25rem' }}>
                    <p style={{ fontWeight: 500, fontSize: '1.05rem', lineHeight: '1.5' }}>
                      {selectedQuestion.Question_Text}
                    </p>
                  </div>

                  {/* Show actual extracted diagram if present */}
                  {(selectedQuestion.Image_Present === 1 || selectedQuestion.Image_Present === true) && (
                    <div className="image-display-container" style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '0.75rem',
                      background: 'rgba(255, 255, 255, 0.01)',
                      border: '1px solid var(--border-glass)',
                      borderRadius: '12px',
                      padding: '1.25rem',
                      margin: '1rem 0'
                    }}>
                      <div 
                        style={{ position: 'relative', cursor: 'zoom-in', width: '100%', display: 'flex', justifyContent: 'center' }}
                        onClick={() => setZoomedImage(selectedQuestion.Embedded_Image)}
                        title="Click to Zoom Diagram"
                      >
                        <img 
                          src={selectedQuestion.Embedded_Image} 
                          alt={selectedQuestion.Image_Description || "Extracted Medical Diagram"} 
                          style={{
                            maxWidth: '100%',
                            maxHeight: '380px',
                            borderRadius: '8px',
                            boxShadow: '0 4px 25px rgba(0, 0, 0, 0.5), 0 0 20px rgba(139, 92, 246, 0.2)',
                            border: '1px solid rgba(255, 255, 255, 0.08)',
                            objectFit: 'contain',
                            background: '#ffffff',
                            padding: '12px'
                          }}
                          onError={(e) => {
                            e.target.onerror = null;
                            e.target.src = "data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22100%22 height=%22100%22 viewBox=%220 0 100 100%22><rect width=%22100%22 height=%22100%22 fill=%22%230f172a%22/><text x=%2250%25%22 y=%2250%25%22 dominant-baseline=%22middle%22 text-anchor=%22middle%22 font-size=%2240%22>🖼️</text></svg>";
                          }}
                        />
                        <div className="zoom-badge-overlay">
                          🔍 Click to Zoom
                        </div>
                      </div>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                        Caption: {selectedQuestion.Image_Description || "Visual diagram extracted from PDF page"}
                      </span>
                    </div>
                  )}

                  {/* Display Multiple Choice Options in Grid */}
                  <div className="options-list">
                    <div className={`option-item ${selectedQuestion.Correct_Answer === 'A' ? 'correct' : ''}`}>
                      <span className="option-letter">A</span>
                      {renderOptionText(selectedQuestion.Option_A)}
                    </div>
                    <div className={`option-item ${selectedQuestion.Correct_Answer === 'B' ? 'correct' : ''}`}>
                      <span className="option-letter">B</span>
                      {renderOptionText(selectedQuestion.Option_B)}
                    </div>
                    <div className={`option-item ${selectedQuestion.Correct_Answer === 'C' ? 'correct' : ''}`}>
                      <span className="option-letter">C</span>
                      {renderOptionText(selectedQuestion.Option_C)}
                    </div>
                    {selectedQuestion.Option_D && selectedQuestion.Option_D.trim() !== '' && (
                      <div className={`option-item ${selectedQuestion.Correct_Answer === 'D' ? 'correct' : ''}`}>
                        <span className="option-letter">D</span>
                        {renderOptionText(selectedQuestion.Option_D)}
                      </div>
                    )}
                  </div>

                  {/* Display Clinical Explanation */}
                  {selectedQuestion.Answer_Explanation && (
                    <div className="explanation-box" style={
                      selectedQuestion.Answer_Explanation.startsWith('[AI Explanation Pending]')
                        ? { background: 'rgba(245, 158, 11, 0.08)', border: '1px solid rgba(245, 158, 11, 0.3)', borderRadius: '8px', padding: '1rem' }
                        : {}
                    }>
                      <h4 style={{ fontFamily: 'var(--font-display)', color: 'var(--accent-violet)', marginBottom: '0.5rem', fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        {selectedQuestion.Answer_Explanation.startsWith('[AI Explanation Pending]')
                          ? <span>⏳ AI Explanation Pending</span>
                          : <span>Clinical Rationale &amp; Answer Explanation</span>
                        }
                      </h4>
                      <p style={{ fontSize: '0.85rem', color: selectedQuestion.Answer_Explanation.startsWith('[AI Explanation Pending]') ? 'rgba(245, 158, 11, 0.9)' : 'var(--text-secondary)', lineHeight: '1.6' }}>
                        {selectedQuestion.Answer_Explanation.startsWith('[AI Explanation Pending]')
                          ? selectedQuestion.Answer_Explanation.replace('[AI Explanation Pending] ', '')
                          : selectedQuestion.Answer_Explanation
                        }
                      </p>
                    </div>
                  )}

                  {/* Metadata Badges Footer */}
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', paddingTop: '1rem', borderTop: '1px solid var(--border-glass)' }}>
                    <span className="badge subject">Subject: {selectedQuestion.Subject}</span>
                    <span className="badge subject" style={{ background: 'rgba(6, 182, 212, 0.15)', color: '#22d3ee' }}>
                      Chapter: {selectedQuestion.Chapter}
                    </span>
                    <span className="badge difficulty">Difficulty: {selectedQuestion.Difficulty_Level}</span>
                    <span className="badge difficulty" style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#34d399' }}>
                      Domain: {selectedQuestion.Clinical_or_Conceptual}
                    </span>
                    <span className="badge" style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--text-primary)' }}>
                      Year: {selectedQuestion.Previous_Year}
                    </span>
                    <span className="badge" style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--text-primary)' }}>
                      Page: {selectedQuestion.Page_Number}
                    </span>
                  </div>
                </div>
              </div>

              {/* Floating Next Button */}
              <button 
                className="modal-nav-btn" 
                onClick={(e) => { e.stopPropagation(); navigateQuestion('next'); }}
                disabled={isLastQuestion}
                style={{
                  background: 'rgba(15, 23, 42, 0.75)',
                  border: '1px solid var(--border-glass)',
                  color: 'var(--text-primary)',
                  width: '52px',
                  height: '52px',
                  borderRadius: '99px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: isLastQuestion ? 'not-allowed' : 'pointer',
                  opacity: isLastQuestion ? 0.3 : 1,
                  fontSize: '1.5rem',
                  transition: 'all 0.2s ease',
                  zIndex: 1010,
                  flexShrink: 0
                }}
                title="Next Question (Right Arrow)"
              >
                →
              </button>

            </div>
          </div>
        );
      })()}

      {/* Zoomed Image Overlay Modal */}
      {zoomedImage && (
        <div className="zoom-overlay" onClick={() => setZoomedImage(null)}>
          <button className="zoom-close" onClick={() => setZoomedImage(null)}>×</button>
          <div className="zoom-content" onClick={(e) => e.stopPropagation()}>
            <img 
              src={zoomedImage} 
              alt="Zoomed Medical Diagram" 
              className="zoom-image"
              onError={(e) => {
                e.target.onerror = null;
                e.target.src = "data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22100%22 height=%22100%22 viewBox=%220 0 100 100%22><rect width=%22100%22 height=%22100%22 fill=%22%230f172a%22/><text x=%2250%25%22 y=%2250%25%22 dominant-baseline=%22middle%22 text-anchor=%22middle%22 font-size=%2240%22>🖼️</text></svg>";
              }}
            />
          </div>
        </div>
      )}

      {/* Settings Configuration Modal */}
      {showSettingsModal && (
        <div className="modal-overlay" onClick={() => setShowSettingsModal(false)}>
          <div className="modal-content" style={{ maxWidth: '480px' }} onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowSettingsModal(false)}>×</button>
            
            <div className="modal-body" style={{ gap: '1.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', borderBottom: '1px solid var(--border-glass)', paddingBottom: '1rem' }}>
                <span style={{ fontSize: '1.75rem' }}>⚙️</span>
                <div>
                  <h3 style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>
                    System Configuration
                  </h3>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    Configure external intelligence keys
                  </span>
                </div>
              </div>
              
              <form onSubmit={handleSaveSettings} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', borderBottom: '1px solid var(--border-glass)', paddingBottom: '1.5rem' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                    Google Gemini API Key
                  </label>
                  <input 
                    type={geminiKeyInput === '****' ? 'text' : 'password'} 
                    className="form-control"
                    placeholder="Enter Google Gemini API Key..."
                    value={geminiKeyInput}
                    onChange={(e) => setGeminiKeyInput(e.target.value)}
                    style={{ fontFamily: geminiKeyInput === '****' ? 'inherit' : 'Consolas, monospace', fontSize: '0.95rem' }}
                    required
                  />
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    {geminiKeyExists ? (
                      <span style={{ color: 'var(--success-emerald)' }}>
                        ✓ Key is already stored and active in the database. Enter a new key above to update.
                      </span>
                    ) : (
                      <span>The key is stored in the local SQLite database and never shared outside.</span>
                    )}
                  </span>
                </div>
                
                {keyLoadError && (
                  <div style={{ color: 'var(--danger-rose)', fontSize: '0.8rem', background: 'rgba(244,63,94,0.05)', padding: '0.5rem 0.75rem', borderRadius: '8px', border: '1px solid rgba(244,63,94,0.1)' }}>
                    {keyLoadError}
                  </div>
                )}
                
                <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                  <button 
                    type="button" 
                    className="btn btn-secondary" 
                    style={{ padding: '0.5rem 1.25rem', fontSize: '0.85rem' }}
                    onClick={() => setShowSettingsModal(false)}
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit" 
                    className="btn btn-cyan"
                    style={{ padding: '0.5rem 1.25rem', fontSize: '0.85rem' }}
                    disabled={isSavingKey}
                  >
                    {isSavingKey ? 'Saving...' : geminiKeyExists ? 'Update Key' : 'Save Key'}
                  </button>
                </div>
              </form>


            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
