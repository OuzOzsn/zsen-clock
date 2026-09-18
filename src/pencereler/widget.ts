import { mount } from 'svelte';
import '../stil/yazitipi.css';
import '../stil/tokens.css';
import '../stil/temel.css';
import Sayfa from './Widget.svelte';

mount(Sayfa, { target: document.getElementById('uygulama')! });
