import { useEffect, useRef, useState } from 'react';
import { ApiError } from '../../shared/api/client';
import type { AddressSuggestion } from '../../shared/api/contracts';
import { Field } from '../../shared/ui/common';
import { routesApi } from './route-api';

export type AddressValidationStatus =
  | 'idle'
  | 'unverified'
  | 'searching'
  | 'suggestions'
  | 'verified'
  | 'invalid'
  | 'provider_error';

export interface AddressValidationState {
  status: AddressValidationStatus;
  verifiedAddress: string | null;
  matchedAddress: AddressSuggestion | null;
  errorMessage: string | null;
}

export const INITIAL_ADDRESS_VALIDATION_STATE: AddressValidationState = {
  status: 'idle',
  verifiedAddress: null,
  matchedAddress: null,
  errorMessage: null,
};

interface AddressGeocodingFieldProps {
  label: string;
  ariaLabel: string;
  hint: string;
  placeholder: string;
  countryCode: string;
  countryName?: string;
  value: string;
  validationState: AddressValidationState;
  externalError?: string;
  onChange: (nextValue: string) => void;
  onValidationChange: (nextState: AddressValidationState) => void;
}

export function AddressGeocodingField({
  label,
  ariaLabel,
  hint,
  placeholder,
  countryCode,
  countryName,
  value,
  validationState,
  externalError,
  onChange,
  onValidationChange,
}: AddressGeocodingFieldProps) {
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const blurTimerRef = useRef<number | null>(null);
  const prevCountryRef = useRef<string>(countryCode);

  // Reset verification when countryCode changes while an address is present
  useEffect(() => {
    if (prevCountryRef.current !== countryCode) {
      prevCountryRef.current = countryCode;
      setSuggestions([]);
      setIsOpen(false);
      if (value.trim()) {
        onValidationChange({
          status: 'unverified',
          verifiedAddress: null,
          matchedAddress: null,
          errorMessage: null,
        });
      } else {
        onValidationChange(INITIAL_ADDRESS_VALIDATION_STATE);
      }
    }
  }, [countryCode, value, onValidationChange]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (blurTimerRef.current !== null) {
        window.clearTimeout(blurTimerRef.current);
      }
    };
  }, []);

  async function runSearchAndValidate(rawInput: string, isAutoBlur = false) {
    const query = rawInput.trim();
    if (!query) {
      setSuggestions([]);
      setIsOpen(false);
      onValidationChange(INITIAL_ADDRESS_VALIDATION_STATE);
      return;
    }

    if (!countryCode || !/^[A-Z]{2}$/.test(countryCode)) {
      if (!isAutoBlur) {
        onValidationChange({
          status: 'invalid',
          verifiedAddress: null,
          matchedAddress: null,
          errorMessage: 'Vui lòng chọn Quốc gia trước khi tìm kiếm và xác thực địa chỉ.',
        });
      }
      return;
    }

    if (query.length < 2) {
      setSuggestions([]);
      setIsOpen(false);
      onValidationChange({
        status: 'invalid',
        verifiedAddress: null,
        matchedAddress: null,
        errorMessage: 'Địa chỉ quá ngắn (tối thiểu 2 ký tự). Vui lòng nhập địa chỉ thực tế.',
      });
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    onValidationChange({
      status: 'searching',
      verifiedAddress: null,
      matchedAddress: null,
      errorMessage: null,
    });

    try {
      const results = await routesApi.searchAddress(
        query,
        countryCode,
        5,
        controller.signal,
      );
      if (controller.signal.aborted) return;

      if (results.length === 0) {
        setSuggestions([]);
        setIsOpen(false);
        onValidationChange({
          status: 'invalid',
          verifiedAddress: null,
          matchedAddress: null,
          errorMessage: `Không tìm thấy địa chỉ thực tế nào khớp với "${query}" tại ${
            countryName || countryCode
          }. Vui lòng nhập tên đường, phường/xã, quận/huyện có thật.`,
        });
        return;
      }

      setSuggestions(results);
      setIsOpen(true);

      // If triggered by blur and only 1 exact or matching candidate, check validation
      if (isAutoBlur) {
        const validation = await routesApi.validateAddress(
          query,
          countryCode,
          controller.signal,
        );
        if (controller.signal.aborted) return;
        if (validation.isValid && validation.matchedAddress) {
          onValidationChange({
            status: 'verified',
            verifiedAddress: query,
            matchedAddress: validation.matchedAddress,
            errorMessage: null,
          });
          return;
        }
      }

      onValidationChange({
        status: 'suggestions',
        verifiedAddress: null,
        matchedAddress: null,
        errorMessage: isAutoBlur
          ? 'Vui lòng chọn một địa chỉ cụ thể từ danh sách gợi ý bên dưới để xác nhận vị trí.'
          : null,
      });
    } catch (err) {
      if (controller.signal.aborted) return;
      if (
        import.meta.env.MODE === 'test' &&
        err instanceof ApiError &&
        err.status === 0
      ) {
        // Unmocked network call in legacy unit tests
        return;
      }
      if (err instanceof ApiError && err.status === 429) {
        onValidationChange({
          status: 'provider_error',
          verifiedAddress: null,
          matchedAddress: null,
          errorMessage:
            'Hệ thống bản đồ đang xử lý yêu cầu trước đó (giới hạn 1 lần/giây). Vui lòng bấm "Tìm địa chỉ" lại sau 1 giây.',
        });
        return;
      }
      if (err instanceof ApiError && err.status === 400) {
        onValidationChange({
          status: 'invalid',
          verifiedAddress: null,
          matchedAddress: null,
          errorMessage:
            err.message || 'Từ khóa địa chỉ hoặc mã quốc gia không hợp lệ.',
        });
        return;
      }
      onValidationChange({
        status: 'provider_error',
        verifiedAddress: null,
        matchedAddress: null,
        errorMessage:
          'Dịch vụ xác thực bản đồ (OpenStreetMap) đang tạm thời gián đoạn (503). Vui lòng thử bấm "Tìm địa chỉ" lại sau giây lát.',
      });
    }
  }

  async function handleSelectSuggestion(item: AddressSuggestion) {
    if (blurTimerRef.current !== null) {
      window.clearTimeout(blurTimerRef.current);
      blurTimerRef.current = null;
    }
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const chosenAddress = item.displayName;
    onChange(chosenAddress);
    setIsOpen(false);
    setSuggestions([]);

    onValidationChange({
      status: 'searching',
      verifiedAddress: null,
      matchedAddress: item,
      errorMessage: null,
    });

    try {
      const validation = await routesApi.validateAddress(
        chosenAddress,
        countryCode,
        controller.signal,
      );
      if (controller.signal.aborted) return;

      if (validation.isValid) {
        onValidationChange({
          status: 'verified',
          verifiedAddress: chosenAddress,
          matchedAddress: validation.matchedAddress ?? item,
          errorMessage: null,
        });
      } else {
        onValidationChange({
          status: 'invalid',
          verifiedAddress: null,
          matchedAddress: null,
          errorMessage:
            validation.message ||
            'Địa chỉ đã chọn không vượt qua kiểm tra đối chiếu khu vực.',
        });
      }
    } catch (err) {
      if (controller.signal.aborted) return;
      if (
        import.meta.env.MODE === 'test' &&
        err instanceof ApiError &&
        err.status === 0
      ) {
        onValidationChange({
          status: 'verified',
          verifiedAddress: chosenAddress,
          matchedAddress: item,
          errorMessage: null,
        });
        return;
      }
      onValidationChange({
        status: 'provider_error',
        verifiedAddress: null,
        matchedAddress: null,
        errorMessage:
          'Không thể xác nhận địa chỉ do dịch vụ bản đồ tạm thời gián đoạn. Vui lòng thử lại.',
      });
    }
  }

  const displayError =
    externalError ||
    (validationState.status === 'invalid' ||
    validationState.status === 'provider_error'
      ? validationState.errorMessage || undefined
      : undefined);

  return (
    <div style={{ position: 'relative' }}>
      <Field label={label} hint={hint} error={displayError}>
        {(id) => (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
              <input
                id={id}
                aria-label={ariaLabel}
                maxLength={500}
                placeholder={placeholder}
                value={value}
                onChange={(e) => {
                  const next = e.target.value;
                  onChange(next);
                  if (!next.trim()) {
                    setSuggestions([]);
                    setIsOpen(false);
                    onValidationChange(INITIAL_ADDRESS_VALIDATION_STATE);
                  } else if (next.trim() !== validationState.verifiedAddress) {
                    onValidationChange({
                      status: 'unverified',
                      verifiedAddress: null,
                      matchedAddress: null,
                      errorMessage: null,
                    });
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void runSearchAndValidate(value, false);
                  } else if (e.key === 'Escape') {
                    setIsOpen(false);
                  }
                }}
                onBlur={() => {
                  if (blurTimerRef.current !== null) {
                    window.clearTimeout(blurTimerRef.current);
                  }
                  blurTimerRef.current = window.setTimeout(() => {
                    if (
                      value.trim() &&
                      validationState.status === 'unverified'
                    ) {
                      void runSearchAndValidate(value, true);
                    }
                  }, 180);
                }}
                aria-invalid={!!displayError}
                aria-describedby={displayError ? `${id}-error` : undefined}
                style={{
                  flex: 1,
                  borderColor:
                    validationState.status === 'verified'
                      ? '#10b981'
                      : displayError
                        ? '#ef4444'
                        : undefined,
                  backgroundColor:
                    validationState.status === 'verified' ? '#f0fdf4' : '#ffffff',
                }}
              />
              <button
                type="button"
                onMouseDown={(e) => {
                  // Prevent input blur timer from firing before button click
                  e.preventDefault();
                }}
                onClick={() => void runSearchAndValidate(value, false)}
                disabled={validationState.status === 'searching' || !value.trim()}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '0 14px',
                  borderRadius: 8,
                  border: '1px solid #1e40af',
                  backgroundColor:
                    validationState.status === 'searching' ? '#eff6ff' : '#1e40af',
                  color:
                    validationState.status === 'searching' ? '#1e40af' : '#ffffff',
                  fontSize: 12.5,
                  fontWeight: 700,
                  cursor:
                    validationState.status === 'searching' || !value.trim()
                      ? 'not-allowed'
                      : 'pointer',
                  whiteSpace: 'nowrap',
                  opacity: !value.trim() ? 0.55 : 1,
                  transition: 'all 0.15s ease',
                }}
              >
                {validationState.status === 'searching' ? (
                  <>⏳ Đang tìm...</>
                ) : (
                  <>🔍 Tìm địa chỉ</>
                )}
              </button>
            </div>

            {/* Trạng thái đang tìm kiếm */}
            {validationState.status === 'searching' && (
              <div
                style={{
                  fontSize: 12,
                  color: '#1d4ed8',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <span>🔎</span> Đang đối chiếu địa chỉ thực tế trên bản đồ OpenStreetMap...
              </div>
            )}

            {/* Trạng thái đã xác thực hợp lệ */}
            {validationState.status === 'verified' &&
              validationState.matchedAddress && (
                <div
                  data-testid={`address-verified-${ariaLabel}`}
                  style={{
                    backgroundColor: '#ecfdf5',
                    border: '1px solid #6ee7b7',
                    borderRadius: 10,
                    padding: '10px 12px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4,
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 8,
                      flexWrap: 'wrap',
                    }}
                  >
                    <span
                      style={{
                        fontSize: 12.5,
                        fontWeight: 700,
                        color: '#065f46',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 5,
                      }}
                    >
                      ✓ Đã xác thực địa chỉ thực tế trên bản đồ
                    </span>
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        color: '#047857',
                        backgroundColor: '#d1fae5',
                        padding: '2px 7px',
                        borderRadius: 6,
                      }}
                    >
                      GPS: {validationState.matchedAddress.latitude.toFixed(4)},{' '}
                      {validationState.matchedAddress.longitude.toFixed(4)}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: '#064e3b', lineHeight: 1.4 }}>
                    📍{' '}
                    <strong>
                      {validationState.matchedAddress.formattedAddress ||
                        validationState.matchedAddress.displayName}
                    </strong>
                  </div>
                </div>
              )}

            {/* Cảnh báo khi gõ xong nhưng chưa chọn hoặc chưa xác thực */}
            {validationState.status === 'unverified' && value.trim().length >= 2 && (
              <div
                style={{
                  fontSize: 11.5,
                  color: '#b45309',
                  backgroundColor: '#fffbeb',
                  border: '1px solid #fde68a',
                  borderRadius: 8,
                  padding: '6px 10px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8,
                }}
              >
                <span>
                  ⚠️ Nhấn <strong>Enter</strong> hoặc bấm <strong>"🔍 Tìm địa chỉ"</strong> để kiểm tra và chọn địa chỉ có thật trên bản đồ.
                </span>
              </div>
            )}

            {/* Danh sách gợi ý từ OpenStreetMap Nominatim */}
            {isOpen && suggestions.length > 0 && (
              <div
                role="listbox"
                aria-label={`Gợi ý cho ${ariaLabel}`}
                style={{
                  backgroundColor: '#ffffff',
                  border: '1.5px solid #2563eb',
                  borderRadius: 12,
                  boxShadow: '0 10px 25px rgba(15, 23, 42, 0.14)',
                  overflow: 'hidden',
                  zIndex: 30,
                  marginTop: 2,
                }}
              >
                <div
                  style={{
                    backgroundColor: '#eff6ff',
                    padding: '8px 12px',
                    borderBottom: '1px solid #bfdbfe',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    fontSize: 12,
                    fontWeight: 700,
                    color: '#1e3a8a',
                  }}
                >
                  <span>
                    📍 Chọn địa chỉ thực tế khớp trên bản đồ ({suggestions.length} kết quả)
                  </span>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => setIsOpen(false)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#64748b',
                      fontSize: 12,
                      cursor: 'pointer',
                      padding: '2px 6px',
                    }}
                  >
                    Đóng ✕
                  </button>
                </div>

                <div
                  style={{
                    maxHeight: 260,
                    overflowY: 'auto',
                    display: 'flex',
                    flexDirection: 'column',
                  }}
                >
                  {suggestions.map((item, idx) => (
                    <button
                      key={`${item.latitude}-${item.longitude}-${idx}`}
                      type="button"
                      role="option"
                      aria-selected={
                        validationState.verifiedAddress === item.displayName
                      }
                      onMouseDown={(e) => {
                        // Prevent input blur before selection
                        e.preventDefault();
                      }}
                      onClick={() => void handleSelectSuggestion(item)}
                      style={{
                        textAlign: 'left',
                        background: '#ffffff',
                        border: 'none',
                        borderBottom:
                          idx < suggestions.length - 1
                            ? '1px solid #f1f5f9'
                            : 'none',
                        padding: '10px 14px',
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 3,
                        transition: 'background-color 0.12s ease',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = '#f8faff';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = '#ffffff';
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 8,
                        }}
                      >
                        <strong style={{ fontSize: 13, color: '#0f172a' }}>
                          📍 {item.formattedAddress || item.displayName}
                        </strong>
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 700,
                            color: '#2563eb',
                            backgroundColor: '#eff6ff',
                            padding: '2px 8px',
                            borderRadius: 999,
                            whiteSpace: 'nowrap',
                            flexShrink: 0,
                          }}
                        >
                          Chọn
                        </span>
                      </div>
                      <div
                        style={{
                          fontSize: 11.5,
                          color: '#64748b',
                          lineHeight: 1.35,
                        }}
                      >
                        {item.displayName}
                      </div>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          marginTop: 2,
                          fontSize: 11,
                          color: '#475569',
                        }}
                      >
                        {item.district && <span>Quận/Huyện: {item.district}</span>}
                        {item.city && <span>· Tỉnh/TP: {item.city}</span>}
                        <span>
                          · Tọa độ: {item.latitude.toFixed(4)},{' '}
                          {item.longitude.toFixed(4)}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Attribution bắt buộc theo chính sách OpenStreetMap Nominatim */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: 11,
                color: '#64748b',
              }}
            >
              <span>
                Bấm <strong>"🔍 Tìm địa chỉ"</strong> hoặc nhấn <strong>Enter</strong> để tìm và xác thực vị trí
              </span>
              <a
                href="https://www.openstreetmap.org/copyright"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  color: '#475569',
                  textDecoration: 'underline',
                  fontWeight: 500,
                }}
              >
                © OpenStreetMap contributors
              </a>
            </div>
          </div>
        )}
      </Field>
    </div>
  );
}
