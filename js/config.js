// Fitcheq app settings. The anon key is public by design; access is enforced by row-level security.
window.FQ_CONFIG = {
  supabaseUrl: 'https://yyrxjsqhmfoncunjurga.supabase.co',
  supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl5cnhqc3FobWZvbmN1bmp1cmdhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI3MDg1NjIsImV4cCI6MjEwODI4NDU2Mn0.pp4huY6OKrDipxBQV-hMv-Olbha8VuEGTx3NQKheUno',
  gymLabel: 'Prozone · Dindigul', // shown on the sign-in screen
  // Shared trial logins for the Prozone demo week. They're public on purpose; their passwords can't be changed.
  trialAccounts: [
    { as: 'owner', label: 'Owner', name: 'Prozone Owner', phone: '9000000001', password: 'Fit-vcy7-gvv8' },
    { as: 'trainer', label: 'Trainer', name: 'Priya Raman', phone: '9000000011', password: 'Fit-3uq9-tf8m' },
    { as: 'member', label: 'Member', name: 'Arjun Mehta', phone: '9000000101', password: 'Fit-6c3w-pyn4' },
  ],
  loginDomain: 'login.fitcheq.inraasolution.com', // phone numbers map to <phone>@<loginDomain>
};
