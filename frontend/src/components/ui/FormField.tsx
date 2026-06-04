import React from 'react';
import { Controller, type Control, type FieldValues, type Path } from 'react-hook-form';

interface FormFieldProps<T extends FieldValues> {
  name: Path<T>;
  label?: string;
  placeholder?: string;
  type?: string;
  control: Control<T>;
  disabled?: boolean;
  className?: string;
  rightElement?: React.ReactNode;
  autoComplete?: string;
}

function FormField<T extends FieldValues>({
  name,
  label,
  placeholder,
  type = 'text',
  control,
  disabled = false,
  className = '',
  rightElement,
  autoComplete,
}: FormFieldProps<T>) {
  return (
    <div className={className}>
      {label && (
        <label className='text-sm font-medium text-[#3F495B] mb-2 block'>
          {label}
        </label>
      )}
      <div className='relative'>
        <Controller
          name={name}
          control={control}
          render={({ field, fieldState }) => (
            <>
              <input
                {...field}
                type={type}
                placeholder={placeholder}
                disabled={disabled}
                autoComplete={autoComplete}
                className={`w-full h-[46px] px-4 rounded-[10px] border bg-white text-sm text-[#111727] placeholder-[#727C8E] focus:outline-none focus:border-[#2562EB] focus:ring-1 focus:ring-[#2562EB] transition-colors ${
                  fieldState.error ? 'border-[#E82828]' : ''
                }`}
              />
              {rightElement && (
                <div className='absolute right-0 top-0 h-full flex items-center pr-1'>
                  {rightElement}
                </div>
              )}
            </>
          )}
        />
      </div>
    </div>
  );
}

export { FormField };
