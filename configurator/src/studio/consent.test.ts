import { describe, expect, test } from 'vitest';
import { consentShort } from './consentShort';

describe('skróty treści zgód', () => {
  test.each([
    ['Wyrażam zgodę na przetwarzanie moich danych (imię, nazwisko, numer telefonu) przez design3d.pl w celu zapisania projektu.', 'Wyrażam zgodę na przetwarzanie moich danych…'],
    ['Wyrażam zgodę na przetwarzanie moich danych (imię, nazwisko, e-mail, telefon) przez design3d.pl oraz ich przekazanie właścicielowi projektu.', 'Wyrażam zgodę na przetwarzanie moich danych…'],
    ['Chcę bezpłatnie otrzymywać zapytania o wyceny schodów z mojej okolicy i wyrażam zgodę na pokazywanie nazwy mojej firmy.', 'Chcę bezpłatnie otrzymywać zapytania o wyceny schodów z mojej okolicy…'],
    ['Wyrażam zgodę na przekazanie mojego projektu schodów oraz danych kontaktowych wykonawcom z mojej okolicy przez design3d.pl w celu przygotowania wyceny.', 'Wyrażam zgodę na przekazanie mojego projektu schodów…'],
  ])('%s', (full, short) => expect(consentShort(full)).toBe(short));
  test('krótka treść bez skracania', () => expect(consentShort('Zgadzam się.')).toBe('Zgadzam się.'));
});
