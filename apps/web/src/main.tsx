import {StrictMode} from 'react';import {createRoot} from 'react-dom/client';import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {ThemeProvider} from '../../../packages/ui/src';import {App} from './app';
import '../../../design-system/tokens.css';import '../../../design-system/ui.css';import '../../../design-system/themes.css';import '../../../design-system/app.css';
const queryClient=new QueryClient({defaultOptions:{queries:{retry:false,refetchOnWindowFocus:false},mutations:{retry:false}}});
createRoot(document.getElementById('root')!).render(<StrictMode><QueryClientProvider client={queryClient}><ThemeProvider><App/></ThemeProvider></QueryClientProvider></StrictMode>);
