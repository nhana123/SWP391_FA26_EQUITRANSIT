export interface HowItWorksStep {
  step: number;
  badge: string;
  badgeColor: string;
  title: string;
  desc: string;
  image: string;
}

export interface RideCategory {
  id: string;
  title: string;
  badge: string;
  desc: string;
  capacity: string;
  climate: string;
  image: string;
}

export interface DestinationHighlight {
  id: string;
  countryCode: string;
  city: string;
  title: string;
  desc: string;
  tag: 'Winter' | 'Racing' | 'Auction' | 'All';
  routes: string;
  image: string;
}

export const HOW_IT_WORKS_STEPS: HowItWorksStep[] = [
  {
    step: 1,
    badge: 'Hassle-free online booking',
    badgeColor: '#2563eb',
    title: 'Khai báo lộ trình & Nhận báo giá',
    desc: 'Chọn quốc gia, sân bay và điểm đến. Hệ thống đối chiếu dữ liệu hải quan, kiểm dịch quốc tế và lập báo giá chuẩn xác.',
    image: '/images/landing/how-it-works/step-1-booking.jpg',
  },
  {
    step: 2,
    badge: 'Follow along the journey',
    badgeColor: '#059669',
    title: 'Theo dõi hành trình đa phương thức',
    desc: 'Cập nhật tiến độ check-in từng mốc chặng, điều hòa khoang vận chuyển 18°C và nhật ký chăm sóc thú y trong suốt chặng đường bộ và đường bay.',
    image: '/images/landing/how-it-works/step-2-transit.jpg',
  },
  {
    step: 3,
    badge: 'Safe & certified delivery',
    badgeColor: '#d97706',
    title: 'Giao nhận an toàn tại chuồng đích',
    desc: 'Chuyên viên kiểm tra thể trạng ngựa, đối chiếu chip điện tử và bàn giao biên bản điện tử có chữ ký xác thực.',
    image: '/images/landing/how-it-works/step-3-delivery.jpg',
  },
];

export const RIDE_CATEGORIES: RideCategory[] = [
  {
    id: 'short-haul',
    title: 'Short Haul Sprinter',
    badge: 'Local & Regional',
    desc: 'Xe van 2 ngựa cơ động dưới 250km, hạ bửng nâng thủy lực, vách đệm êm ái cho đổi chuồng và thú y trong ngày.',
    capacity: '1 - 2 Ngựa',
    climate: 'Thông gió chủ động',
    image: '/images/landing/rides/short-haul.jpg',
  },
  {
    id: 'mare-foal',
    title: 'Mare & Foal Suite',
    badge: 'Breeding Transit',
    desc: 'Khoang VIP siêu rộng gấp đôi, lót rơm sạch dày, camera hồng ngoại theo dõi sát sao ngựa mẹ và ngựa con.',
    capacity: 'Ngựa mẹ + Ngựa con',
    climate: 'Khí tươi & Sưởi ấm',
    image: '/images/landing/rides/mare-foal.jpg',
  },
  {
    id: 'commercial-hauler',
    title: 'Commercial Air-Ride',
    badge: 'Heavy Fleet',
    desc: 'Đoàn xe rơ-moóc lớn 6-9 ngựa chuẩn thi đấu quốc tế với hệ thống treo bóng hơi êm ái triệt tiêu rung chấn đường dài.',
    capacity: '6 - 9 Ngựa',
    climate: 'Điều hòa nhiệt độ kép',
    image: '/images/landing/rides/commercial-hauler.jpg',
  },
  {
    id: 'veterinary-transport',
    title: 'Equine Vet Ambulance',
    badge: 'Veterinary ICU',
    desc: 'Xe cấp cứu thú y trang bị đai nâng đỡ toàn thân, bình oxy dự phòng, màn hình đo nhịp tim và bác sĩ đi kèm.',
    capacity: '1 Ngựa ICU',
    climate: 'Kiểm soát vô trùng',
    image: '/images/landing/rides/veterinary-transport.jpg',
  },
  {
    id: 'box-stall-vip',
    title: 'Air Charter Equi-Stall',
    badge: 'Intercontinental Air',
    desc: 'Chuồng đơn container hàng không chuẩn IATA LAR trên chuyên cơ vận tải, kiểm soát áp suất và nhiệt độ 18°C.',
    capacity: 'Chuồng đơn hoặc đôi',
    climate: 'Áp suất & Lọc HEPA',
    image: '/images/landing/rides/box-stall-vip.jpg',
  },
];

export const DESTINATION_CARDS: DestinationHighlight[] = [
  {
    id: 'wellington',
    countryCode: 'US',
    city: 'Wellington, FL',
    title: 'Wellington, Florida',
    desc: 'Thủ phủ đua ngựa mùa đông, trung tâm Lễ hội Cưỡi ngựa Mùa đông (WEF) và Global Dressage Festival.',
    tag: 'Winter',
    routes: 'Từ Lexington, Ocala, Nội Bài, Tân Sơn Nhất',
    image: '/images/landing/destinations/wellington-fl.jpg',
  },
  {
    id: 'ocala',
    countryCode: 'US',
    city: 'Ocala, FL',
    title: 'Ocala, Florida',
    desc: 'Thủ đô ngựa thế giới, trung tâm World Equestrian Center và các trại huấn luyện giống Thoroughbred hàng đầu.',
    tag: 'Winter',
    routes: 'Từ Wellington, Atlanta, Changi, Tokyo',
    image: '/images/landing/destinations/ocala-fl.jpg',
  },
  {
    id: 'lexington',
    countryCode: 'US',
    city: 'Lexington, KY',
    title: 'Lexington, Kentucky',
    desc: 'Trung tâm đấu giá ngựa giống quốc tế Keeneland, các trại ngựa giống danh giá tại vùng đồng cỏ Bluegrass.',
    tag: 'Auction',
    routes: 'Từ Churchill Downs, Saratoga, Belmont Park',
    image: '/images/landing/destinations/lexington-ky.jpg',
  },
  {
    id: 'aiken',
    countryCode: 'US',
    city: 'Aiken, SC',
    title: 'Aiken, South Carolina',
    desc: 'Trung tâm đua ngựa vượt rào Steeplechase truyền thống, câu lạc bộ Polo và khu huấn luyện thể thao mùa đông.',
    tag: 'Winter',
    routes: 'Từ Tryon, Ocala, Camden',
    image: '/images/landing/destinations/aiken-sc.jpg',
  },
  {
    id: 'saratoga',
    countryCode: 'US',
    city: 'Saratoga Springs, NY',
    title: 'Saratoga Springs, New York',
    desc: 'Mùa giải đua hè danh tiếng tại trường đua lịch sử Saratoga và phiên đấu giá yearling Fasig-Tipton danh giá.',
    tag: 'Racing',
    routes: 'Từ Belmont, Keeneland, London Heathrow',
    image: '/images/landing/destinations/saratoga-ny.jpg',
  },
  {
    id: 'scottsdale',
    countryCode: 'US',
    city: 'Scottsdale, AZ',
    title: 'Scottsdale, Arizona',
    desc: 'Giải đua triển lãm Arabian Horse Show lớn nhất hành tinh và mùa giải thể thao sa mạc Tây Nam Hoa Kỳ.',
    tag: 'Racing',
    routes: 'Từ Santa Anita, Del Mar, Dubai DXB',
    image: '/images/landing/destinations/scottsdale-az.jpg',
  },
];

export interface ServiceTariffDisclosure {
  id: string;
  category: string;
  serviceName: string;
  unit: string;
  unitPriceUSD: number;
  desc: string;
  standard: string;
}

export const SERVICE_TARIFF_DISCLOSURES: ServiceTariffDisclosure[] = [
  {
    id: 'road-transport',
    category: 'Vận chuyển liên vận',
    serviceName: 'Vận tải chuyên dụng đường bộ',
    unit: 'Kilomet vận hành',
    unitPriceUSD: 2.0,
    desc: 'Đoàn xe rơ-moóc thùng kín cách nhiệt, hệ thống giảm xóc bóng hơi triệt tiêu rung chấn, camera an sinh và lái xe chuyên nghiệp.',
    standard: 'Quy chuẩn an sinh vận tải ngựa FEI',
  },
  {
    id: 'air-fare',
    category: 'Vận chuyển liên vận',
    serviceName: 'Cước vận chuyển chuyên cơ hàng không',
    unit: 'Chuyến bay trọn gói',
    unitPriceUSD: 1500.0,
    desc: 'Suất tải trên tàu bay vận tải chuyên dụng bay các chặng bay quốc tế chuyên chở động vật sống.',
    standard: 'Tiêu chuẩn vận tải hàng không IATA LAR',
  },
  {
    id: 'air-stall',
    category: 'Chuồng trại & Lưu trú',
    serviceName: 'Khoang chuồng bay chuyên dụng (Equi-Stall)',
    unit: 'Khoang chuồng · Kilomet',
    unitPriceUSD: 0.25,
    desc: 'Khoang chuồng bay đơn hoặc đôi bằng hợp kim nhẹ, vách chống sốc composite, khay nạp cỏ và máng nước điện giải tự động.',
    standard: 'Chứng nhận khoang chuồng IATA Container 51',
  },
  {
    id: 'basic-care',
    category: 'Dinh dưỡng & Chăm sóc',
    serviceName: 'Khẩu phần dinh dưỡng & Nước uống tiêu chuẩn',
    unit: 'Tiêu chuẩn trọn gói',
    unitPriceUSD: 0.0,
    desc: 'Cung cấp cỏ khô Timothy tinh sạch, bù nước bù điện giải cách ly vô trùng và kiểm tra thể trạng định kỳ suốt lộ trình.',
    standard: 'Đã bao gồm trong chi phí vận chuyển',
  },
  {
    id: 'horse-care',
    category: 'Dinh dưỡng & Chăm sóc',
    serviceName: 'Gói chăm sóc an sinh tăng cường',
    unit: 'Cá thể ngựa / Chuyến',
    unitPriceUSD: 80.0,
    desc: 'Chế độ ăn vi lượng đặc biệt dành cho ngựa thi đấu, chuyên viên chăm sóc riêng túc trực và camera truyền hình ảnh trực tiếp.',
    standard: 'Gói phục hồi thể lực chuyên sâu',
  },
  {
    id: 'boarding',
    category: 'Chuồng trại & Lưu trú',
    serviceName: 'Lưu chuồng chuyển tiếp qua đêm',
    unit: 'Đêm lưu chuồng / Ngựa',
    unitPriceUSD: 40.0,
    desc: 'Chuồng lưu chuyển tiếp tại các trạm trung chuyển trung tâm, lót mùn cưa tiệt trùng, hệ thống quạt thông gió và giám sát 24/7.',
    standard: 'Tiêu chuẩn chuồng trại EquiTransit Hub',
  },
  {
    id: 'veterinary-exam',
    category: 'Y tế & Thú y kiểm dịch',
    serviceName: 'Khám lâm sàng & Cấp chứng thư thú y',
    unit: 'Lần khám / Cá thể ngựa',
    unitPriceUSD: 60.0,
    desc: 'Bác sĩ thú y quốc tế khám sức khỏe tổng quát, xác thực mã vi chip định danh ISO và cấp chứng chỉ đủ điều kiện bay.',
    standard: 'Quy chuẩn chứng thư thú y quốc tế',
  },
  {
    id: 'quarantine-stay',
    category: 'Kiểm dịch xuất nhập cảnh',
    serviceName: 'Lưu trú trạm cách ly kiểm dịch',
    unit: 'Ngày lưu trạm / Ngựa',
    unitPriceUSD: 50.0,
    desc: 'Lưu chuồng cách ly tại trạm kiểm dịch chỉ định của Cục Thú y, theo dõi dịch tễ và lấy mẫu xét nghiệm kháng thể Coggins & CEM.',
    standard: 'Nghị định thư kiểm dịch động vật sống',
  },
  {
    id: 'customs-declaration',
    category: 'Thủ tục hải quan',
    serviceName: 'Thủ tục thông quan & Khai báo hải quan',
    unit: 'Bộ tờ khai hải quan',
    unitPriceUSD: 40.0,
    desc: 'Bộ hồ sơ tờ khai thông quan động vật sống, đối chiếu danh tính vi chip, giấy phép CITES (nếu có) và thủ tục cửa khẩu.',
    standard: 'Thông quan xuất nhập khẩu chính ngạch',
  },
  {
    id: 'marine-insurance',
    category: 'Bảo hiểm vận chuyển',
    serviceName: 'Bảo hiểm rủi ro vận tải ngựa đua',
    unit: 'Hợp đồng bảo hiểm / Chuyến',
    unitPriceUSD: 150.0,
    desc: 'Bảo hiểm trách nhiệm vận chuyển toàn diện cho cá thể ngựa đua giá trị cao trong suốt hành trình đường bộ và hàng không quốc tế.',
    standard: 'Chứng thư bảo hiểm vận tải quốc tế',
  },
];
