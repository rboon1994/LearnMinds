import { Input } from './Input';

const SearchIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
  </svg>
);

interface SearchInputProps {
  id: string;
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
}

export function SearchInput({ id, value, onValueChange, placeholder }: SearchInputProps) {
  return (
    <Input
      id={id}
      value={value}
      onChange={(e) => onValueChange(e.target.value)}
      placeholder={placeholder}
      leftIcon={<SearchIcon />}
    />
  );
}
