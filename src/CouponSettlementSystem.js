import React, { useState, useEffect } from 'react';
import { Calendar, Check, AlertCircle, Eye, ArrowRight, ArrowLeft, Filter, Users, CreditCard, Upload, FileSpreadsheet, Heart, Download, Database } from 'lucide-react';
import * as XLSX from 'xlsx';

// Firebase 설정 (환경변수에서 가져오기)
const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.REACT_APP_FIREBASE_APP_ID
};

const CouponSettlementSystem = () => {
  const [selectedMonth, setSelectedMonth] = useState('');
  const [data, setData] = useState([]);
  const [fileName, setFileName] = useState('');
  const [isFileUploaded, setIsFileUploaded] = useState(false);
  const [fileType, setFileType] = useState(''); // 'doljabi' 또는 'wedding'
  const [filteredData, setFilteredData] = useState([]);
  const [selectedCoupons, setSelectedCoupons] = useState({});
  const [groupedData, setGroupedData] = useState({});
  const [finalList, setFinalList] = useState({});
  const [duplicateItems, setDuplicateItems] = useState([]);
  const [selectedItems, setSelectedItems] = useState({});
  const [showDuplicatesOnly, setShowDuplicatesOnly] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const [messages, setMessages] = useState([]);
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState('');

  // Firebase 초기화
  const initializeFirebase = async () => {
    console.log('=== Firebase 초기화 시작 ===');
    console.log('API Key:', firebaseConfig.apiKey ? '설정됨' : '없음');
    console.log('Project ID:', firebaseConfig.projectId);
    
    if (!firebaseConfig.apiKey) {
      console.log('Firebase 설정이 없습니다.');
      return null;
    }

    try {
      // Firebase 라이브러리가 설치되어 있는지 확인
      console.log('Firebase 라이브러리 로드 시도...');
      const { initializeApp } = await import('firebase/app');
      const { getFirestore } = await import('firebase/firestore');
      
      console.log('Firebase 앱 초기화 중...');
      const app = initializeApp(firebaseConfig);
      const db = getFirestore(app);
      console.log('Firebase 초기화 성공!');
      return db;
    } catch (error) {
      console.error('Firebase 초기화 오류:', error);
      alert(`Firebase 초기화 실패: ${error.message}`);
      return null;
    }
  };

  // Firebase에 정산 데이터 저장
  const saveToFirebase = async () => {
    console.log('=== Firebase 저장 시작 ===');
    console.log('저장할 메시지 개수:', messages.length);
    
    if (!messages.length) {
      alert('저장할 데이터가 없습니다.');
      return;
    }

    setIsSaving(true);
    setSaveStatus('데이터 저장 중...');

    try {
      console.log('Firebase 초기화 시도...');
      const db = await initializeFirebase();
      if (!db) {
        throw new Error('Firebase 초기화에 실패했습니다.');
      }

      console.log('Firestore 함수 로드 중...');
      const { collection, addDoc, serverTimestamp } = await import('firebase/firestore');
      
      console.log('데이터 저장 시작...');
      const results = [];
      
      // 각 업체별 정산 내역을 저장
      for (let i = 0; i < messages.length; i++) {
        const msg = messages[i];
        console.log(`${i + 1}/${messages.length} - ${msg.couponCode} 저장 중...`);
        
        const settlementData = {
          업체명: msg.couponCode,
          합계금액: msg.totalAmount,
          입금내역: msg.message,
          정산월: selectedMonth,
          건수: msg.totalCount,
          파일타입: fileType,
          생성일시: serverTimestamp(),
          상태: '미입금'
        };

        console.log('저장할 데이터:', settlementData);

        try {
          const docRef = await addDoc(collection(db, 'settlements'), settlementData);
          console.log(`${msg.couponCode} 저장 성공, Document ID:`, docRef.id);
          results.push({ couponCode: msg.couponCode, success: true, id: docRef.id });
        } catch (docError) {
          console.error(`${msg.couponCode} 저장 실패:`, docError);
          results.push({ couponCode: msg.couponCode, success: false, error: docError.message });
        }
      }

      const successCount = results.filter(r => r.success).length;
      const failCount = results.filter(r => !r.success).length;
      
      console.log('=== 저장 결과 ===');
      console.log('성공:', successCount);
      console.log('실패:', failCount);
      console.log('상세 결과:', results);

      if (failCount > 0) {
        const failedCompanies = results.filter(r => !r.success).map(r => r.couponCode).join(', ');
        setSaveStatus(`일부 저장 실패: 성공 ${successCount}건, 실패 ${failCount}건 (${failedCompanies})`);
      } else {
        setSaveStatus(`${successCount}개 업체 데이터가 성공적으로 저장되었습니다!`);
      }
      
      setTimeout(() => setSaveStatus(''), 5000);
      
    } catch (error) {
      console.error('=== Firebase 저장 오류 ===');
      console.error('오류 메시지:', error.message);
      console.error('오류 스택:', error.stack);
      
      setSaveStatus(`저장 실패: ${error.message}`);
      setTimeout(() => setSaveStatus(''), 5000);
    } finally {
      setIsSaving(false);
    }
  };

  // 컴포넌트 마운트 시 기본 엑셀 파일 읽기 시도
  useEffect(() => {
    loadDefaultExcelData();
  }, []);

  // 파일 타입 자동 감지
  const detectFileType = (jsonData) => {
    if (!jsonData || jsonData.length === 0) return 'unknown';
    
    const columns = Object.keys(jsonData[0]);
    
    // 돌잔치 파일 특징: 돌잔치날짜, 아가이름, 아빠이름 등
    const doljabiColumns = ['돌잔치날짜', '아가이름', '아빠이름', '엄마이름'];
    const doljabiScore = doljabiColumns.filter(col => columns.includes(col)).length;
    
    // 웨딩 파일 특징: 신랑이름, 신부이름 등
    const weddingColumns = ['신랑이름', '신부이름', '웨딩날짜', '결혼식날짜', '예식날짜'];
    const weddingScore = weddingColumns.filter(col => columns.includes(col)).length;
    
    if (doljabiScore >= 2) return 'doljabi';
    if (weddingScore >= 1) return 'wedding'; // 신랑이름, 신부이름 중 하나만 있어도 웨딩
    
    // 추가 로직: 구분 값으로 판단
    const sampleData = jsonData.slice(0, 10);
    const categoryValues = sampleData.map(row => row['구분']).filter(Boolean).join(' ').toLowerCase();
    
    if (categoryValues.includes('식전') || categoryValues.includes('포스터')) return 'wedding';
    if (categoryValues.includes('럽플릭스') || categoryValues.includes('메인')) return 'doljabi';
    
    return 'unknown';
  };

  const loadDefaultExcelData = async () => {
    try {
      const response = await window.fs.readFile('쿠폰 내역 1.xlsx');
      const workbook = XLSX.read(response);
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(worksheet);
      
      const detectedType = detectFileType(jsonData);
      setData(jsonData);
      setFileName('쿠폰 내역 1.xlsx');
      setFileType(detectedType);
      setIsFileUploaded(true);
    } catch (error) {
      console.log('기본 파일을 찾을 수 없습니다. 파일을 업로드해주세요.');
      setIsFileUploaded(false);
    }
  };

  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    try {
      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer);
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(worksheet);
      
      const detectedType = detectFileType(jsonData);
      setData(jsonData);
      setFileName(file.name);
      setFileType(detectedType);
      setIsFileUploaded(true);
      
      // 기존 상태 초기화
      setFilteredData([]);
      setSelectedCoupons({});
      setGroupedData({});
      setFinalList({});
      setDuplicateItems([]);
      setSelectedItems({});
      setMessages([]);
      setCurrentStep(1);
      
    } catch (error) {
      console.error('파일 읽기 오류:', error);
      alert('파일을 읽는 중 오류가 발생했습니다. Excel 파일인지 확인해주세요.');
    }
  };

  // 이전 단계로 돌아가기
  const goToPreviousStep = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  // 1단계: 월별 필터링
  const filterByMonth = () => {
    if (!selectedMonth) return;
    
    // 제외할 쿠폰코드 목록 (파일 타입별로 다름)
    let excludedCoupons = [];
    if (fileType === 'wedding') {
      excludedCoupons = [
        'STK110GA',
        'STK010Z', 
        '혀니웨딩짱',
        'STL3TV11',
        '알러뷰위위유',
        'STK210F',
        'LOVFLIX'
      ];
    } else {
      // 돌잔치 제외 쿠폰
      excludedCoupons = [
        'EVENTKN', 'STK220K', 'STF210F', 'STK210F',
        'LOVFLIX', 'INSTALF', 'PASTELTEST', 'BLOG28TS', 'S1TKFN244'
      ];
    }
    
    const [year, month] = selectedMonth.split('-');
    const filtered = data.filter(row => {
      const couponCode = row['쿠폰 코드'];
      if (excludedCoupons.includes(couponCode)) return false;
      
      // 웨딩의 경우 사용일자로 필터링 (돌잔치날짜가 없음)
      const dateField = fileType === 'wedding' ? '사용일자' : '돌잔치날짜';
      if (!row[dateField]) return false;
      
      const dateStr = row[dateField].toString();
      
      if (fileType === 'wedding') {
        // 사용일자 형식: "2025-08-28 18:59:57"
        const datePart = dateStr.split(' ')[0]; // "2025-08-28"
        const [rowYear, rowMonth] = datePart.split('-');
        return rowYear === year && rowMonth === month.padStart(2, '0');
      } else {
        // 돌잔치날짜 형식: "25-08-02"
        const parts = dateStr.split('-');
        if (parts.length === 3) {
          const rowYear = '20' + parts[0];
          const rowMonth = parts[1];
          return rowYear === year && rowMonth === month.padStart(2, '0');
        }
      }
      return false;
    });
    
    const filteredWithId = filtered.map((row, index) => ({
      ...row,
      filteredId: `filtered_${index}`
    }));
    
    setFilteredData(filteredWithId);
    
    // 쿠폰코드별로 그룹핑하여 선택 옵션 제공
    const couponGroups = {};
    filteredWithId.forEach(row => {
      const couponCode = row['쿠폰 코드'];
      if (!couponGroups[couponCode]) {
        couponGroups[couponCode] = [];
      }
      couponGroups[couponCode].push(row);
    });
    
    // 모든 쿠폰코드를 기본 선택 상태로 설정
    const initialSelected = {};
    Object.keys(couponGroups).forEach(couponCode => {
      initialSelected[couponCode] = true;
    });
    setSelectedCoupons(initialSelected);
    
    setCurrentStep(2);
  };

  // 2단계: 쿠폰코드별 그룹핑
  const groupData = () => {
    const selectedCouponList = Object.keys(selectedCoupons).filter(coupon => selectedCoupons[coupon]);
    const selectedData = filteredData.filter(row => selectedCouponList.includes(row['쿠폰 코드']));
    
    const grouped = {};
    
    selectedData.forEach(row => {
      const couponCode = row['쿠폰 코드'];
      const videoType = row['구분'];
      
      if (!grouped[couponCode]) {
        grouped[couponCode] = {
          couponCode: couponCode,
          customers: new Map()
        };
      }
      
      let customerKey;
      if (fileType === 'wedding') {
        // 웨딩: 신랑이름 + 신부이름으로 고객 식별
        customerKey = `${row['신랑이름']}_${row['신부이름']}`;
      } else {
        // 돌잔치: 아가이름 + 돌잔치날짜로 고객 식별
        customerKey = `${row['아가이름']}_${row['돌잔치날짜']}`;
      }
      
      if (!grouped[couponCode].customers.has(customerKey)) {
        const customerInfo = fileType === 'wedding' 
          ? {
              groomName: row['신랑이름'],
              brideName: row['신부이름'],
              managementNo: row['관리번호'],
              usageDate: row['사용일자'],
              videoTypes: new Set()
            }
          : {
              babyName: row['아가이름'],
              dadName: row['아빠이름'],
              momName: row['엄마이름'],
              partyDate: row['돌잔치날짜'],
              managementNo: row['관리번호'],
              videoTypes: new Set()
            };
        
        grouped[couponCode].customers.set(customerKey, customerInfo);
      }
      
      grouped[couponCode].customers.get(customerKey).videoTypes.add(videoType);
    });
    
    const processedGrouped = {};
    Object.keys(grouped).forEach(couponCode => {
      const customers = Array.from(grouped[couponCode].customers.values()).map(customer => ({
        ...customer,
        videoTypes: Array.from(customer.videoTypes)
      }));
      
      processedGrouped[couponCode] = {
        couponCode: couponCode,
        customers: customers
      };
    });
    
    setGroupedData(processedGrouped);
    setCurrentStep(3);
  };

  // 3단계: 중복 감지
  const detectDuplicates = () => {
    const final = {};
    const duplicates = [];
    
    Object.keys(groupedData).forEach(couponCode => {
      const group = groupedData[couponCode];
      const processedCustomers = [];
      const names = new Map();
      
      group.customers.forEach((customer, index) => {
        let primaryName, secondaryName;
        
        if (fileType === 'wedding') {
          primaryName = customer.groomName;
          secondaryName = customer.brideName;
        } else {
          primaryName = customer.babyName;
          secondaryName = customer.momName;
        }
        
        const shortPrimaryName = primaryName ? primaryName.replace(/^[김이박최정강조윤장임]/, '') : '';
        const customerWithId = { ...customer, id: `${couponCode}_${index}` };
        
        // 중복 체크
        for (const [existingName, existingIndex] of names.entries()) {
          const existingShortName = existingName.replace(/^[김이박최정강조윤장임]/, '');
          if (shortPrimaryName === existingShortName || primaryName === existingName) {
            duplicates.push({
              couponCode: couponCode,
              customer1: processedCustomers[existingIndex],
              customer2: customerWithId,
              reason: shortPrimaryName === existingShortName ? '이름 유사' : '이름 동일'
            });
            break;
          }
        }
        
        names.set(primaryName, processedCustomers.length);
        processedCustomers.push(customerWithId);
      });
      
      if (processedCustomers.length > 0) {
        final[couponCode] = {
          ...group,
          customers: processedCustomers
        };
      }
    });
    
    setFinalList(final);
    setDuplicateItems(duplicates);
    
    // 초기 선택 상태 설정
    const initialSelected = {};
    Object.keys(final).forEach(couponCode => {
      final[couponCode].customers.forEach(customer => {
        initialSelected[customer.id] = true;
      });
    });
    
    // 중복 항목 중 두 번째 항목은 기본적으로 선택 해제
    duplicates.forEach(dup => {
      initialSelected[dup.customer2.id] = false;
    });
    
    setSelectedItems(initialSelected);
    setCurrentStep(4);
  };

  // 고객 이름 포매팅
  const formatCustomerName = (customer) => {
    if (fileType === 'wedding') {
      return `${customer.groomName} & ${customer.brideName}`;
    } else {
      if (customer.momName && customer.momName.trim()) {
        return `${customer.babyName}(${customer.momName})`;
      }
      return customer.babyName;
    }
  };

  // 4단계: 정산 메시지 생성
  const generateMessages = () => {
    const messageList = [];
    
    Object.keys(finalList).forEach(couponCode => {
      const selectedCustomers = finalList[couponCode].customers.filter(
        customer => selectedItems[customer.id]
      );
      
      if (selectedCustomers.length > 0) {
        const totalAmount = selectedCustomers.length * 5000;
        
        const serviceType = fileType === 'wedding' ? '웨딩영상' : '돌잔치영상';
        const message = `안녕하세요😁
건별 정산내용 보내드립니다!
이번달은 ${selectedCustomers.length}건의 ${serviceType} 제작건이 있었습니다. 
최종 합계금액은 ${totalAmount.toLocaleString()}원이며 입금계좌는 아래와 같습니다.
상세내역:
${selectedCustomers.map((customer) => 
  `${formatCustomerName(customer)}`
).join('\n')}
국민은행 이용현 781601-00-231766 으로
합계금액 ${totalAmount.toLocaleString()}원을 입금 요청드립니다.
오늘 하루도 행복만 가득하세요!`;

        messageList.push({
          couponCode: couponCode,
          message: message,
          totalCount: selectedCustomers.length,
          totalAmount: totalAmount
        });
      }
    });
    
    setMessages(messageList);
    setCurrentStep(5);
  };

  // 정산 내역을 텍스트 파일로 다운로드
  const downloadSettlement = () => {
    let content = `정산 내역 - ${selectedMonth}\n`;
    content += `=`.repeat(50) + '\n\n';
    
    messages.forEach(msg => {
      content += `업체: ${msg.couponCode}\n`;
      content += `건수: ${msg.totalCount}건\n`;
      content += `금액: ${msg.totalAmount.toLocaleString()}원\n`;
      content += `\n메시지 내용:\n`;
      content += `-`.repeat(30) + '\n';
      content += msg.message + '\n';
      content += `=`.repeat(50) + '\n\n';
    });
    
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `정산내역_${selectedMonth}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const getSystemTitle = () => {
    if (fileType === 'wedding') return '웨딩 정산 관리 시스템';
    if (fileType === 'doljabi') return '쿠폰 정산 관리 시스템';
    return '정산 관리 시스템';
  };

  const getSystemIcon = () => {
    if (fileType === 'wedding') return <Heart className="w-8 h-8 text-white" />;
    return <CreditCard className="w-8 h-8 text-white" />;
  };

  const getSystemColor = () => {
    if (fileType === 'wedding') return 'from-pink-600 to-rose-600';
    return 'from-blue-600 to-indigo-600';
  };

  const stepNames = ['기간 설정', '쿠폰 선택', '중복 확인', '최종 검토', '완료'];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      <div className="container mx-auto px-6 py-8">
        {/* 헤더 */}
        <div className="text-center mb-8">
          <div className={`inline-flex items-center justify-center w-16 h-16 bg-gradient-to-r ${getSystemColor()} rounded-2xl mb-4 shadow-lg`}>
            {getSystemIcon()}
          </div>
          <h1 className="text-4xl font-bold bg-gradient-to-r from-gray-900 to-gray-600 bg-clip-text text-transparent mb-3">
            {getSystemTitle()}
          </h1>
          <p className="text-gray-600 text-lg">
            {fileType === 'wedding' ? '완벽한 웨딩 정산 관리' : '간편하고 정확한 정산 관리'}
          </p>
          {fileType && (
            <div className={`inline-flex items-center gap-2 mt-2 px-4 py-2 rounded-full text-sm font-medium ${
              fileType === 'wedding' 
                ? 'bg-pink-100 text-pink-700' 
                : 'bg-blue-100 text-blue-700'
            }`}>
              {fileType === 'wedding' ? <Heart className="w-4 h-4" /> : <CreditCard className="w-4 h-4" />}
              {fileType === 'wedding' ? '웨딩 파일' : '돌잔치 파일'} 자동 감지됨
            </div>
          )}
        </div>

        {/* Firebase 설정 상태 표시 */}
        <div className="bg-white/80 backdrop-blur-sm rounded-3xl p-6 mb-8 shadow-xl border border-white/20">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-gradient-to-r from-orange-100 to-red-100 rounded-xl flex items-center justify-center">
                <Database className="w-6 h-6 text-orange-600" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-800">Firebase 데이터베이스</h3>
                <div className="flex items-center gap-4 text-sm">
                  <span className={`flex items-center gap-2 ${firebaseConfig.apiKey ? 'text-green-600' : 'text-red-600'}`}>
                    <div className={`w-2 h-2 rounded-full ${firebaseConfig.apiKey ? 'bg-green-500' : 'bg-red-500'}`}></div>
                    API 키 {firebaseConfig.apiKey ? '설정됨' : '미설정'}
                  </span>
                  <span className={`flex items-center gap-2 ${firebaseConfig.projectId ? 'text-green-600' : 'text-red-600'}`}>
                    <div className={`w-2 h-2 rounded-full ${firebaseConfig.projectId ? 'bg-green-500' : 'bg-red-500'}`}></div>
                    프로젝트 {firebaseConfig.projectId ? '설정됨' : '미설정'}
                  </span>
                </div>
                {!firebaseConfig.apiKey && (
                  <div className="text-xs text-gray-500 mt-1">
                    .env 파일에 Firebase 설정을 추가하세요
                  </div>
                )}
              </div>
            </div>
            
            <div className="text-right">
              <div className="text-sm text-gray-600 mb-1">데이터 저장</div>
              <div className="font-mono text-xs bg-gray-100 px-2 py-1 rounded">
                {firebaseConfig.apiKey ? 'settlements 컬렉션' : '미설정'}
              </div>
            </div>
          </div>
        </div>
        <div className="bg-white/80 backdrop-blur-sm rounded-3xl p-6 mb-8 shadow-xl border border-white/20">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-gradient-to-r from-green-100 to-emerald-100 rounded-xl flex items-center justify-center">
                <FileSpreadsheet className="w-6 h-6 text-green-600" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-800">데이터 파일</h3>
                {isFileUploaded ? (
                  <div className="flex items-center gap-2 text-sm text-green-600">
                    <Check className="w-4 h-4" />
                    <span>{fileName} ({data.length.toLocaleString()}건)</span>
                  </div>
                ) : (
                  <p className="text-sm text-gray-600">엑셀 파일을 업로드해주세요</p>
                )}
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <input
                type="file"
                id="excel-upload"
                accept=".xlsx,.xls"
                onChange={handleFileUpload}
                className="hidden"
              />
              <label
                htmlFor="excel-upload"
                className="px-6 py-3 bg-gradient-to-r from-green-500 to-emerald-600 text-white font-semibold rounded-xl hover:from-green-600 hover:to-emerald-700 transition-all duration-200 flex items-center gap-2 cursor-pointer shadow-lg hover:shadow-xl transform hover:scale-105"
              >
                <Upload className="w-4 h-4" />
                <span>{isFileUploaded ? '파일 변경' : '파일 업로드'}</span>
              </label>
            </div>
          </div>
        </div>

        {/* 진행 단계 */}
        {isFileUploaded && (
          <div className="bg-white/70 backdrop-blur-sm rounded-3xl p-8 mb-8 shadow-xl border border-white/20">
            <div className="flex items-center justify-between mb-6">
              {[1, 2, 3, 4, 5].map((step, index) => (
                <React.Fragment key={step}>
                  <div className="flex flex-col items-center">
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center font-semibold text-sm transition-all duration-300 ${
                      currentStep >= step 
                        ? `bg-gradient-to-r ${getSystemColor()} text-white shadow-lg scale-105` 
                        : 'bg-gray-200 text-gray-500'
                    }`}>
                      {currentStep > step ? <Check className="w-5 h-5" /> : step}
                    </div>
                    <span className={`mt-3 text-xs font-medium ${
                      currentStep >= step 
                        ? fileType === 'wedding' ? 'text-pink-600' : 'text-blue-600'
                        : 'text-gray-400'
                    }`}>
                      {stepNames[step - 1]}
                    </span>
                  </div>
                  {index < 4 && (
                    <div className={`flex-1 h-0.5 mx-4 rounded-full transition-all duration-300 ${
                      currentStep > step 
                        ? `bg-gradient-to-r ${getSystemColor()}` 
                        : 'bg-gray-200'
                    }`} />
                  )}
                </React.Fragment>
              ))}
            </div>
          </div>
        )}

        {/* 1단계: 월 선택 */}
        {currentStep === 1 && isFileUploaded && (
          <div className="bg-white/80 backdrop-blur-sm rounded-3xl p-8 shadow-xl border border-white/20">
            <div className="flex items-center mb-6">
              <div className={`w-12 h-12 bg-gradient-to-r ${fileType === 'wedding' ? 'from-pink-100 to-rose-100' : 'from-blue-100 to-indigo-100'} rounded-xl flex items-center justify-center mr-4`}>
                <Calendar className={`w-6 h-6 ${fileType === 'wedding' ? 'text-pink-600' : 'text-blue-600'}`} />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-gray-800">기간 설정</h2>
                <p className="text-gray-600">정산할 월을 선택해주세요</p>
              </div>
            </div>
            
            <div className={`bg-gradient-to-r ${fileType === 'wedding' ? 'from-pink-50 to-rose-50' : 'from-blue-50 to-indigo-50'} rounded-2xl p-6 mb-6`}>
              <div className="flex flex-col sm:flex-row items-center gap-4">
                <input
                  type="month"
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className={`px-4 py-3 border-2 ${fileType === 'wedding' ? 'border-pink-200 focus:border-pink-500' : 'border-blue-200 focus:border-blue-500'} rounded-xl focus:outline-none transition-colors bg-white/50 backdrop-blur-sm text-lg font-medium`}
                />
                <button
                  onClick={filterByMonth}
                  disabled={!selectedMonth}
                  className={`px-8 py-3 bg-gradient-to-r ${getSystemColor()} text-white font-semibold rounded-xl hover:opacity-90 disabled:from-gray-300 disabled:to-gray-400 transition-all duration-200 flex items-center gap-2 shadow-lg hover:shadow-xl disabled:shadow-none transform hover:scale-105 disabled:scale-100`}
                >
                  <span>다음 단계</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
            
            {data.length > 0 && (
              <div className="flex items-center gap-3 text-gray-600">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                <span>현재 파일에서 총 <span className="font-semibold text-gray-800">{data.length.toLocaleString()}</span>건의 데이터를 확인했습니다</span>
              </div>
            )}
          </div>
        )}

        {/* 2단계: 쿠폰코드 선택 */}
        {currentStep === 2 && isFileUploaded && (
          <div className="bg-white/80 backdrop-blur-sm rounded-3xl p-8 shadow-xl border border-white/20">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center">
                <div className={`w-12 h-12 bg-gradient-to-r ${fileType === 'wedding' ? 'from-rose-100 to-pink-100' : 'from-emerald-100 to-green-100'} rounded-xl flex items-center justify-center mr-4`}>
                  <CreditCard className={`w-6 h-6 ${fileType === 'wedding' ? 'text-rose-600' : 'text-emerald-600'}`} />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-gray-800">쿠폰 선택</h2>
                  <p className="text-gray-600">정산할 쿠폰코드를 선택해주세요</p>
                </div>
              </div>
              
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    const updatedSelection = {};
                    Object.keys(selectedCoupons).forEach(coupon => {
                      updatedSelection[coupon] = true;
                    });
                    setSelectedCoupons(updatedSelection);
                  }}
                  className={`px-4 py-2 ${fileType === 'wedding' ? 'bg-pink-100 text-pink-700 hover:bg-pink-200' : 'bg-blue-100 text-blue-700 hover:bg-blue-200'} rounded-xl transition-colors font-medium`}
                >
                  전체선택
                </button>
                <button
                  onClick={() => {
                    const updatedSelection = {};
                    Object.keys(selectedCoupons).forEach(coupon => {
                      updatedSelection[coupon] = false;
                    });
                    setSelectedCoupons(updatedSelection);
                  }}
                  className="px-4 py-2 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 transition-colors font-medium"
                >
                  전체해제
                </button>
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mb-8 max-h-96 overflow-y-auto">
              {Object.keys(selectedCoupons).map(couponCode => {
                const couponData = filteredData.filter(row => row['쿠폰 코드'] === couponCode);
                const uniqueCustomers = new Set();
                couponData.forEach(row => {
                  const customerKey = fileType === 'wedding' 
                    ? `${row['신랑이름']}_${row['신부이름']}`
                    : `${row['아가이름']}_${row['돌잔치날짜']}`;
                  uniqueCustomers.add(customerKey);
                });
                
                return (
                  <div key={couponCode} className={`group cursor-pointer transition-all duration-200 transform hover:scale-105 ${
                    selectedCoupons[couponCode] 
                      ? `bg-gradient-to-br ${fileType === 'wedding' ? 'from-pink-500 to-rose-600' : 'from-blue-500 to-indigo-600'} text-white shadow-lg` 
                      : 'bg-white hover:bg-gray-50 text-gray-700 shadow-md hover:shadow-lg'
                  } rounded-2xl p-5 border ${selectedCoupons[couponCode] ? (fileType === 'wedding' ? 'border-pink-200' : 'border-blue-200') : 'border-gray-200'}`}>
                    <label className="flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedCoupons[couponCode] || false}
                        onChange={() => {
                          setSelectedCoupons(prev => ({
                            ...prev,
                            [couponCode]: !prev[couponCode]
                          }));
                        }}
                        className="sr-only"
                      />
                      <div className="flex-1">
                        <div className="font-bold text-lg mb-2">{couponCode}</div>
                        <div className={`text-sm ${selectedCoupons[couponCode] ? (fileType === 'wedding' ? 'text-pink-100' : 'text-blue-100') : 'text-gray-500'}`}>
                          <div className="flex items-center gap-2">
                            <Users className="w-4 h-4" />
                            <span>{couponData.length}건 / {uniqueCustomers.size}명</span>
                          </div>
                        </div>
                      </div>
                      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                        selectedCoupons[couponCode] 
                          ? 'border-white bg-white' 
                          : `border-gray-300 ${fileType === 'wedding' ? 'group-hover:border-pink-300' : 'group-hover:border-blue-300'}`
                      }`}>
                        {selectedCoupons[couponCode] && (
                          <Check className={`w-3 h-3 ${fileType === 'wedding' ? 'text-pink-600' : 'text-blue-600'}`} />
                        )}
                      </div>
                    </label>
                  </div>
                );
              })}
            </div>
            
            <div className={`bg-gradient-to-r ${fileType === 'wedding' ? 'from-rose-50 to-pink-50' : 'from-emerald-50 to-green-50'} rounded-2xl p-6 flex justify-between items-center`}>
              <button
                onClick={goToPreviousStep}
                className="px-6 py-3 bg-white border border-gray-300 text-gray-700 font-semibold rounded-xl hover:bg-gray-50 transition-all duration-200 flex items-center gap-2 shadow-sm hover:shadow-md"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>이전 단계</span>
              </button>
              
              <div className="text-gray-700 flex items-center gap-4">
                <span className={`font-semibold ${fileType === 'wedding' ? 'text-rose-700' : 'text-emerald-700'}`}>
                  {Object.values(selectedCoupons).filter(Boolean).length}개
                </span>
                <span className="mx-2">/</span>
                <span className="text-gray-600">
                  총 {Object.keys(selectedCoupons).length}개 쿠폰 선택됨
                </span>
              </div>
              
              <button
                onClick={groupData}
                disabled={Object.values(selectedCoupons).filter(Boolean).length === 0}
                className={`px-8 py-3 bg-gradient-to-r ${fileType === 'wedding' ? 'from-rose-600 to-pink-600 hover:from-rose-700 hover:to-pink-700' : 'from-emerald-600 to-green-600 hover:from-emerald-700 hover:to-green-700'} text-white font-semibold rounded-xl disabled:from-gray-300 disabled:to-gray-400 transition-all duration-200 flex items-center gap-2 shadow-lg hover:shadow-xl disabled:shadow-none transform hover:scale-105 disabled:scale-100`}
              >
                <span>다음 단계</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* 3단계: 그룹핑 결과 */}
        {currentStep === 3 && isFileUploaded && (
          <div className="bg-white/80 backdrop-blur-sm rounded-3xl p-8 shadow-xl border border-white/20">
            <div className="flex items-center mb-6">
              <div className="w-12 h-12 bg-gradient-to-r from-amber-100 to-yellow-100 rounded-xl flex items-center justify-center mr-4">
                <Filter className="w-6 h-6 text-amber-600" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-gray-800">데이터 그룹핑</h2>
                <p className="text-gray-600">
                  {fileType === 'wedding' ? '웨딩 쿠폰코드별로 고객 데이터를 정리했습니다' : '쿠폰코드별로 고객 데이터를 정리했습니다'}
                </p>
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8 max-h-96 overflow-y-auto">
              {Object.keys(groupedData).map(couponCode => (
                <div key={couponCode} className="bg-gradient-to-br from-white to-gray-50 rounded-2xl p-6 shadow-lg border border-gray-100 hover:shadow-xl transition-all duration-200">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-bold text-lg text-gray-800">{couponCode}</h3>
                    <div className={`px-3 py-1 ${fileType === 'wedding' ? 'bg-pink-100 text-pink-700' : 'bg-blue-100 text-blue-700'} rounded-full text-sm font-medium`}>
                      {groupedData[couponCode].customers.length}명
                    </div>
                  </div>
                  <div className={`text-sm text-gray-600 ${fileType === 'wedding' ? 'bg-pink-50' : 'bg-blue-50'} rounded-lg p-3`}>
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 ${fileType === 'wedding' ? 'bg-pink-500' : 'bg-blue-500'} rounded-full`}></div>
                      <span>{fileType === 'wedding' ? '식전, 인트로, 포스터 영상 통합' : '메인, 인트로, 엔딩영상 통합'}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                      <span>같은 고객 여러 영상 = 1건</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            
            <div className="bg-gradient-to-r from-amber-50 to-yellow-50 rounded-2xl p-6 flex justify-between items-center">
              <button
                onClick={goToPreviousStep}
                className="px-6 py-3 bg-white border border-gray-300 text-gray-700 font-semibold rounded-xl hover:bg-gray-50 transition-all duration-200 flex items-center gap-2 shadow-sm hover:shadow-md"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>이전 단계</span>
              </button>
              
              <button
                onClick={detectDuplicates}
                className="px-8 py-3 bg-gradient-to-r from-amber-600 to-yellow-600 text-white font-semibold rounded-xl hover:from-amber-700 hover:to-yellow-700 transition-all duration-200 flex items-center gap-2 shadow-lg hover:shadow-xl transform hover:scale-105"
              >
                <span>중복 감지 시작</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* 4단계: 중복 확인 및 최종 선택 */}
        {currentStep === 4 && isFileUploaded && (
          <div className="bg-white/80 backdrop-blur-sm rounded-3xl p-8 shadow-xl border border-white/20">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center">
                <div className={`w-12 h-12 bg-gradient-to-r ${fileType === 'wedding' ? 'from-rose-100 to-pink-100' : 'from-purple-100 to-indigo-100'} rounded-xl flex items-center justify-center mr-4`}>
                  <Users className={`w-6 h-6 ${fileType === 'wedding' ? 'text-rose-600' : 'text-purple-600'}`} />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-gray-800">중복 확인 및 최종 선택</h2>
                  <p className="text-gray-600">중복 항목을 확인하고 최종 정산 대상을 선택하세요</p>
                </div>
              </div>
              
              {duplicateItems.length > 0 && (
                <div className="flex bg-gray-100 rounded-xl p-1">
                  <button
                    onClick={() => setShowDuplicatesOnly(false)}
                    className={`px-4 py-2 rounded-lg font-medium transition-all ${
                      !showDuplicatesOnly 
                        ? 'bg-white text-gray-800 shadow-sm' 
                        : 'text-gray-600 hover:text-gray-800'
                    }`}
                  >
                    전체 보기
                  </button>
                  <button
                    onClick={() => setShowDuplicatesOnly(true)}
                    className={`px-4 py-2 rounded-lg font-medium transition-all flex items-center gap-2 ${
                      showDuplicatesOnly 
                        ? 'bg-amber-500 text-white shadow-sm' 
                        : 'text-gray-600 hover:text-gray-800'
                    }`}
                  >
                    <AlertCircle className="w-4 h-4" />
                    중복만 보기 ({duplicateItems.length})
                  </button>
                </div>
              )}
            </div>
            
            {/* 상단 통계 */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
              <div className={`bg-gradient-to-r ${fileType === 'wedding' ? 'from-pink-50 to-rose-50 border-pink-200' : 'from-blue-50 to-indigo-50 border-blue-200'} rounded-2xl p-4 border`}>
                <div className={`${fileType === 'wedding' ? 'text-pink-600' : 'text-blue-600'} text-sm font-medium`}>전체 고객</div>
                <div className={`text-2xl font-bold ${fileType === 'wedding' ? 'text-pink-800' : 'text-blue-800'}`}>
                  {Object.keys(finalList).reduce((acc, couponCode) => acc + finalList[couponCode].customers.length, 0)}명
                </div>
              </div>
              <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-2xl p-4 border border-green-200">
                <div className="text-green-600 text-sm font-medium">선택된 고객</div>
                <div className="text-2xl font-bold text-green-800">
                  {Object.values(selectedItems).filter(Boolean).length}명
                </div>
              </div>
              <div className="bg-gradient-to-r from-purple-50 to-pink-50 rounded-2xl p-4 border border-purple-200">
                <div className="text-purple-600 text-sm font-medium">예상 금액</div>
                <div className="text-2xl font-bold text-purple-800">
                  {(Object.values(selectedItems).filter(Boolean).length * 5000).toLocaleString()}원
                </div>
              </div>
            </div>

            {/* 고객 목록 */}
            <div className="space-y-6 mb-8 max-h-96 overflow-y-auto">
              {Object.keys(finalList).map(couponCode => {
                const selectedCount = finalList[couponCode].customers.filter(c => selectedItems[c.id]).length;
                const totalCount = finalList[couponCode].customers.length;
                
                const duplicateCustomerIds = new Set();
                duplicateItems.forEach(dup => {
                  if (dup.couponCode === couponCode) {
                    duplicateCustomerIds.add(dup.customer1.id);
                    duplicateCustomerIds.add(dup.customer2.id);
                  }
                });
                
                return (
                  <div key={couponCode} className="bg-gradient-to-r from-white to-gray-50 rounded-2xl shadow-lg border border-gray-200 overflow-hidden">
                    <div className="bg-gradient-to-r from-gray-50 to-gray-100 p-6 border-b border-gray-200">
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-4">
                          <h3 className="text-2xl font-bold text-gray-800">{couponCode}</h3>
                          <div className="flex gap-2">
                            <button
                              onClick={() => {
                                const updatedSelection = { ...selectedItems };
                                finalList[couponCode].customers.forEach(customer => {
                                  updatedSelection[customer.id] = true;
                                });
                                setSelectedItems(updatedSelection);
                              }}
                              className={`px-3 py-1.5 ${fileType === 'wedding' ? 'bg-pink-100 text-pink-700 hover:bg-pink-200' : 'bg-blue-100 text-blue-700 hover:bg-blue-200'} rounded-lg transition-colors text-sm font-medium`}
                            >
                              전체선택
                            </button>
                            <button
                              onClick={() => {
                                const updatedSelection = { ...selectedItems };
                                finalList[couponCode].customers.forEach(customer => {
                                  updatedSelection[customer.id] = false;
                                });
                                setSelectedItems(updatedSelection);
                              }}
                              className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-medium"
                            >
                              전체해제
                            </button>
                          </div>
                        </div>
                        <div className={`bg-gradient-to-r ${getSystemColor()} text-white px-6 py-3 rounded-xl font-bold text-lg`}>
                          {selectedCount}/{totalCount}건 / {(selectedCount * 5000).toLocaleString()}원
                        </div>
                      </div>
                    </div>
                    
                    <div className="p-6">
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                        {finalList[couponCode].customers.map((customer) => {
                          const isDuplicate = duplicateCustomerIds.has(customer.id);
                          
                          return (
                            <div key={customer.id} className={`relative p-4 rounded-xl border-2 transition-all duration-200 ${
                              selectedItems[customer.id] 
                                ? isDuplicate
                                  ? 'border-amber-400 bg-amber-50 ring-2 ring-amber-200' 
                                  : `border-${fileType === 'wedding' ? 'pink' : 'blue'}-400 bg-${fileType === 'wedding' ? 'pink' : 'blue'}-50 ring-2 ring-${fileType === 'wedding' ? 'pink' : 'blue'}-200`
                                : isDuplicate
                                  ? 'border-amber-300 bg-amber-25 hover:bg-amber-50'
                                  : 'border-gray-200 bg-white hover:bg-gray-50 hover:border-gray-300'
                            }`}>
                              <label className="flex items-start cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={selectedItems[customer.id] || false}
                                  onChange={() => {
                                    setSelectedItems(prev => ({
                                      ...prev,
                                      [customer.id]: !prev[customer.id]
                                    }));
                                  }}
                                  className="w-4 h-4 text-blue-600 mr-3 mt-0.5"
                                />
                                <div className="flex-1 min-w-0">
                                  <div className="font-bold text-gray-800 truncate mb-1">
                                    {formatCustomerName(customer)}
                                  </div>
                                  <div className="text-sm text-gray-600 space-y-0.5">
                                    <div>{fileType === 'wedding' ? customer.usageDate?.split(' ')[0] : customer.partyDate}</div>
                                    <div className="text-xs text-gray-500">{customer.managementNo}</div>
                                    {customer.videoTypes && (
                                      <div className="flex flex-wrap gap-1 mt-1">
                                        {customer.videoTypes.map(type => (
                                          <span key={type} className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                                            {type}
                                          </span>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </label>
                              
                              {isDuplicate && (
                                <div className="absolute top-2 right-2 w-5 h-5 bg-amber-500 text-white rounded-full flex items-center justify-center">
                                  <AlertCircle className="w-3 h-3" />
                                </div>
                              )}
                              
                              {selectedItems[customer.id] && (
                                <div className={`absolute top-2 ${isDuplicate ? 'right-8' : 'right-2'} w-5 h-5 rounded-full flex items-center justify-center ${
                                  isDuplicate ? 'bg-amber-600' : `bg-${fileType === 'wedding' ? 'pink' : 'blue'}-500`
                                } text-white`}>
                                  <Check className="w-3 h-3" />
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className={`bg-gradient-to-r ${fileType === 'wedding' ? 'from-rose-50 to-pink-50' : 'from-purple-50 to-indigo-50'} rounded-2xl p-6 flex justify-between items-center`}>
              <button
                onClick={goToPreviousStep}
                className="px-6 py-3 bg-white border border-gray-300 text-gray-700 font-semibold rounded-xl hover:bg-gray-50 transition-all duration-200 flex items-center gap-2 shadow-sm hover:shadow-md"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>이전 단계</span>
              </button>
              
              <button
                onClick={generateMessages}
                disabled={Object.values(selectedItems).filter(Boolean).length === 0}
                className={`px-8 py-3 bg-gradient-to-r ${fileType === 'wedding' ? 'from-rose-600 to-pink-600 hover:from-rose-700 hover:to-pink-700' : 'from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700'} text-white font-semibold rounded-xl disabled:from-gray-300 disabled:to-gray-400 transition-all duration-200 flex items-center gap-2 shadow-lg hover:shadow-xl disabled:shadow-none transform hover:scale-105 disabled:scale-100`}
              >
                <Eye className="w-4 h-4" />
                <span>정산 내역 생성</span>
              </button>
            </div>
          </div>
        )}

        {/* 5단계: 정산 내역 확인 */}
        {currentStep === 5 && isFileUploaded && (
          <div className="bg-white/80 backdrop-blur-sm rounded-3xl p-8 shadow-xl border border-white/20">
            <div className="flex items-center mb-6">
              <div className={`w-12 h-12 bg-gradient-to-r ${fileType === 'wedding' ? 'from-pink-100 to-rose-100' : 'from-green-100 to-emerald-100'} rounded-xl flex items-center justify-center mr-4`}>
                <Check className={`w-6 h-6 ${fileType === 'wedding' ? 'text-pink-600' : 'text-green-600'}`} />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-gray-800">정산 내역 완료</h2>
                <p className="text-gray-600">생성된 정산 내역을 확인하고 다운로드하세요</p>
              </div>
            </div>
            
            <div className="space-y-6 mb-8 max-h-96 overflow-y-auto">
              {messages.map((msg, idx) => (
                <div key={idx} className="bg-gradient-to-r from-white to-gray-50 rounded-2xl p-6 shadow-lg border border-gray-200">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-xl font-bold text-gray-800">{msg.couponCode}</h3>
                    <div className={`bg-gradient-to-r ${fileType === 'wedding' ? 'from-pink-500 to-rose-600' : 'from-green-500 to-emerald-600'} text-white px-4 py-2 rounded-xl font-bold`}>
                      {msg.totalCount}건 / {msg.totalAmount.toLocaleString()}원
                    </div>
                  </div>
                  <div className="bg-gray-50 rounded-xl p-4 font-mono text-sm whitespace-pre-line text-gray-700 border border-gray-200">
                    {msg.message}
                  </div>
                </div>
              ))}
            </div>
            
            <div className={`bg-gradient-to-r ${fileType === 'wedding' ? 'from-pink-50 to-rose-50' : 'from-green-50 to-emerald-50'} rounded-2xl p-6 flex justify-between items-center`}>
              <button
                onClick={goToPreviousStep}
                className="px-6 py-3 bg-white border border-gray-300 text-gray-700 font-semibold rounded-xl hover:bg-gray-50 transition-all duration-200 flex items-center gap-2 shadow-sm hover:shadow-md"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>이전 단계</span>
              </button>
              
              <div className="flex gap-4">
                <button
                  onClick={downloadSettlement}
                  className={`px-8 py-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold rounded-2xl transition-all duration-200 flex items-center gap-3 shadow-lg hover:shadow-xl transform hover:scale-105`}
                >
                  <Download className="w-5 h-5" />
                  <span>파일 다운로드</span>
                </button>
                
                <button
                  onClick={saveToFirebase}
                  disabled={isSaving || !firebaseConfig.apiKey}
                  className={`px-8 py-4 bg-gradient-to-r ${firebaseConfig.apiKey ? 'from-orange-600 to-red-600 hover:from-orange-700 hover:to-red-700' : 'from-gray-400 to-gray-500'} text-white font-bold rounded-2xl transition-all duration-200 flex items-center gap-3 shadow-lg hover:shadow-xl transform hover:scale-105 disabled:scale-100 disabled:shadow-none`}
                >
                  <Database className="w-5 h-5" />
                  <span>{isSaving ? '저장 중...' : 'Firebase 저장'}</span>
                </button>
              </div>
            </div>
            
            {/* 저장 상태 메시지 */}
            {saveStatus && (
              <div className={`mt-4 p-4 rounded-xl ${saveStatus.includes('성공') ? 'bg-green-100 text-green-800 border border-green-200' : 'bg-red-100 text-red-800 border border-red-200'}`}>
                <div className="flex items-center gap-2">
                  {saveStatus.includes('성공') ? (
                    <Check className="w-5 h-5" />
                  ) : (
                    <AlertCircle className="w-5 h-5" />
                  )}
                  <span className="font-medium">{saveStatus}</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 파일 업로드 안내 */}
        {!isFileUploaded && (
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-dashed border-blue-300 rounded-3xl p-12 text-center">
            <div className="w-20 h-20 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-full flex items-center justify-center mx-auto mb-6">
              <Upload className="w-10 h-10 text-white" />
            </div>
            <h3 className="text-2xl font-bold text-gray-800 mb-4">엑셀 파일을 업로드하세요</h3>
            <p className="text-gray-600 mb-8">쿠폰 내역이 포함된 엑셀 파일을 선택하면 정산 작업을 시작할 수 있습니다</p>
            <div className="text-sm text-gray-500 bg-white rounded-xl p-4 inline-block">
              <div className="font-medium mb-2">지원 형식</div>
              <div className="flex items-center gap-4">
                <span>💒 웨딩 파일</span>
                <span>🎂 돌잔치 파일</span>
              </div>
              <div className="text-xs mt-2 text-gray-400">파일 형식은 자동으로 감지됩니다</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CouponSettlementSystem;