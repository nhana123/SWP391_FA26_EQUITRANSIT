import type { IconName } from '../../components/ui/Icons';
import type { SectionCode } from './contracts';

// Section labels only. Availability, rates and suitability always come from the server.
export const serviceSections: Record<SectionCode, { title: string; hint: string; icon: IconName }> =
  {
    TRANSPORTATION: {
      title: 'Transportation',
      hint: 'Road legs and who arranges them',
      icon: 'truck',
    },
    AIR_STALL: {
      title: 'Available Air Stalls for Your Horse',
      hint: 'Stall size and sharing on the aircraft',
      icon: 'globe',
    },
    HORSE_CARE: {
      title: 'Horse Care',
      hint: 'Grooming, boarding and enhanced care',
      icon: 'horse',
    },
    VETERINARY: {
      title: 'Veterinary',
      hint: 'Exams, tests, vaccines and certificates',
      icon: 'plus',
    },
    QUARANTINE: {
      title: 'Quarantine Packages',
      hint: 'Quarantine package for this route',
      icon: 'file',
    },
    INSURANCE: { title: 'Insurance', hint: 'Mortality or combined cover', icon: 'shield' },
    ADDITIONAL_CHARGES: {
      title: 'Additional Charges',
      hint: 'Handling, customs and event-based charges',
      icon: 'wallet',
    },
  };
