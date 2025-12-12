package controllers

import "testing"

func TestStripOraclePrefix(t *testing.T) {
	tests := []struct {
		in   string
		want string
	}{
		{in: "oracle/foo/tenant", want: "/tenant"},
		{in: "/oracle/foo/tenant", want: "/tenant"},
		{in: "/bob", want: "/bob"},
		{in: "bob", want: "/bob"},
		{in: "/oracle/foo", want: "/"},
		{in: "oracle/foo/", want: "/"},
		{in: "", want: "/"},
	}

	for _, tc := range tests {
		got := stripOraclePrefix(tc.in)
		if got != tc.want {
			t.Errorf("stripOraclePrefix(%q) = %q; want %q", tc.in, got, tc.want)
		}
	}
}
