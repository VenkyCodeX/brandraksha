import unittest

import pandas as pd

from feature_extraction import hostname_group, validate_and_prepare


class FeatureExtractionTests(unittest.TestCase):
    def test_host_group_uses_hostname_not_full_path(self):
        self.assertEqual(hostname_group('https://example.com/a?b=1'), 'example.com')
        self.assertEqual(hostname_group('example.com/other'), 'example.com')

    def test_prepare_keeps_url_out_of_features_and_deduplicates_same_label(self):
        rows = pd.DataFrame([
            {'url': 'https://safe.example/path', 'label': '0', 'url_length': 24, 'num_dots': 1, 'has_https': 1, 'has_ip': 0, 'num_subdirs': 1, 'num_params': 0, 'suspicious_words': 0, 'tld': 'example', 'special_char_count': 2, 'digits_count': 0, 'entropy': 3.5},
            {'url': 'https://safe.example/path', 'label': '0', 'url_length': 24, 'num_dots': 1, 'has_https': 1, 'has_ip': 0, 'num_subdirs': 1, 'num_params': 0, 'suspicious_words': 0, 'tld': 'example', 'special_char_count': 2, 'digits_count': 0, 'entropy': 3.5},
            {'url': 'http://bad.example/path', 'label': '1', 'url_length': 23, 'num_dots': 1, 'has_https': 0, 'has_ip': 0, 'num_subdirs': 1, 'num_params': 0, 'suspicious_words': 1, 'tld': 'example', 'special_char_count': 2, 'digits_count': 0, 'entropy': 3.7},
        ])

        features, labels, groups, metadata = validate_and_prepare(rows)

        self.assertNotIn('url', features.columns)
        self.assertEqual(len(features), 2)
        self.assertEqual(labels.tolist(), ['0', '1'])
        self.assertEqual(groups.tolist(), ['safe.example', 'bad.example'])
        self.assertEqual(metadata['duplicate_url_rows_removed'], 1)

    def test_rejects_conflicting_duplicate_labels(self):
        rows = pd.DataFrame([
            {'url': 'https://same.example', 'label': '0', 'url_length': 10, 'num_dots': 1, 'has_https': 1, 'has_ip': 0, 'num_subdirs': 0, 'num_params': 0, 'suspicious_words': 0, 'tld': 'example', 'special_char_count': 0, 'digits_count': 0, 'entropy': 2.0},
            {'url': 'https://same.example', 'label': '1', 'url_length': 10, 'num_dots': 1, 'has_https': 1, 'has_ip': 0, 'num_subdirs': 0, 'num_params': 0, 'suspicious_words': 1, 'tld': 'example', 'special_char_count': 0, 'digits_count': 0, 'entropy': 2.0},
        ])

        with self.assertRaisesRegex(ValueError, 'conflicting labels'):
            validate_and_prepare(rows)


if __name__ == '__main__':
    unittest.main()