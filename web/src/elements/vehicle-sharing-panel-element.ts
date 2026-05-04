import {LitElement, html} from 'lit';
import {msg} from '@lit/localize';
import {customElement, property, state} from 'lit/decorators.js';
import {globalStyles} from '../global-styles.ts';
import {ApiService} from '@services/api-service.ts';
import dayjs from 'dayjs';
import './click-to-copy-element';

interface SacdNode {
  grantee?: string;
  permissions?: string;
  source?: string;
  expiresAt?: string;
  createdAt?: string;
}

interface VehicleSharingResponse {
  vehicle?: {
    sacds?: {
      nodes?: SacdNode[];
    };
  };
}

interface DeveloperLicense {
  alias?: string;
  owner?: string;
}

type DeveloperLicensesResponse = Record<string, DeveloperLicense | null>;

interface UserProfileInfo {
  wallet?: string;
  email?: string;
  first_name?: string;
  last_name?: string;
}

@customElement('vehicle-sharing-panel')
export class VehicleSharingPanel extends LitElement {
  static styles = [globalStyles];

  @property({type: Number})
  tokenID: number = 0;

  @state()
  private sacds: SacdNode[] = [];

  @state()
  private loading: boolean = false;

  @state()
  private errorMessage: string = '';

  @state()
  private granteeLicenses: Map<string, DeveloperLicense> = new Map();

  @state()
  private granteeUserProfiles: Map<string, UserProfileInfo> = new Map();

  private api: ApiService = ApiService.getInstance();
  private lastLoadedTokenID: number = 0;

  willUpdate(changedProperties: Map<string | number | symbol, unknown>) {
    if (changedProperties.has('tokenID') && this.tokenID && this.tokenID !== this.lastLoadedTokenID) {
      this.lastLoadedTokenID = this.tokenID;
      void this.loadSharing();
    }
  }

  private async loadSharing() {
    this.loading = true;
    this.errorMessage = '';

    const query = `{
      vehicle(tokenId: ${this.tokenID}) {
        sacds(first: 15) {
          nodes {
            grantee
            permissions
            source
            expiresAt
            createdAt
          }
        }
      }
    }`;

    try {
      const response = await this.api.callApi<VehicleSharingResponse>(
        'POST',
        '/identity/proxy',
        {query},
        false,
        false,
        false
      );

      if (response.success && response.data) {
        this.sacds = response.data.vehicle?.sacds?.nodes ?? [];
        void this.loadGranteeLicenses(this.sacds);
      } else {
        this.errorMessage = response.error || msg('Failed to load sharing information');
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error loading vehicle sharing:', error);
      this.errorMessage = error instanceof Error ? error.message : msg('Failed to load sharing information');
    } finally {
      this.loading = false;
    }
  }

  private async loadGranteeLicenses(sacds: SacdNode[]) {
    const grantees = Array.from(new Set(sacds.map(s => s.grantee).filter((g): g is string => !!g)));
    if (grantees.length === 0) {
      this.granteeLicenses = new Map();
      return;
    }

    const aliasedFields = grantees
      .map((grantee, i) => `g${i}: developerLicense(by: { clientId: "${grantee}" }) { alias owner }`)
      .join('\n        ');
    const query = `{
        ${aliasedFields}
      }`;

    try {
      const response = await this.api.callApi<DeveloperLicensesResponse>(
        'POST',
        '/identity/proxy',
        {query},
        false,
        false,
        false
      );

      const next = new Map<string, DeveloperLicense>();
      if (response.success && response.data) {
        grantees.forEach((grantee, i) => {
          const license = response.data?.[`g${i}`];
          if (license && (license.alias || license.owner)) {
            next.set(grantee.toLowerCase(), license);
          }
        });
      }
      this.granteeLicenses = next;

      const unresolved = grantees.filter(g => !next.get(g.toLowerCase())?.alias);
      if (unresolved.length > 0) {
        void this.loadGranteeUserProfiles(unresolved);
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error loading developer licenses:', error);
    }
  }

  private async loadGranteeUserProfiles(grantees: string[]) {
    const next = new Map(this.granteeUserProfiles);
    await Promise.all(grantees.map(async (grantee) => {
      try {
        const response = await this.api.callApi<UserProfileInfo>(
          'GET',
          `/user-profiles/${grantee}`,
          null,
          true,
          true
        );
        if (response.success && response.data) {
          next.set(grantee.toLowerCase(), response.data);
        }
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Error loading user profile for grantee:', grantee, error);
      }
    }));
    this.granteeUserProfiles = next;
  }

  private formatWalletAddress(address: string): string {
    if (!address || address.length < 10) return address;
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  }

  private renderGrantee(grantee: string | undefined) {
    if (!grantee) return html``;
    const key = grantee.toLowerCase();

    const license = this.granteeLicenses.get(key);
    if (license?.alias) {
      const titleParts = [];
      if (license.owner) titleParts.push(`owner: ${license.owner}`);
      titleParts.push(`grantee: ${grantee}`);
      return html`<span title=${titleParts.join('\n')}>${license.alias}</span>`;
    }

    const profile = this.granteeUserProfiles.get(key);
    const fullName = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ').trim();
    if (profile && fullName) {
      const navigate = (e: Event) => {
        e.preventDefault();
        window.location.hash = `/users/profile/${grantee}`;
      };
      return html`<a class="link" href="#/users/profile/${grantee}" @click=${navigate} title="grantee: ${grantee}">${fullName}</a>`;
    }

    return html`
      <click-to-copy-element .valueToCopy="${grantee}">
        ${this.formatWalletAddress(grantee)}
      </click-to-copy-element>
    `;
  }

  private renderSource(source: string | undefined) {
    if (!source) return html``;
    const ipfsPrefix = 'ipfs://';
    if (!source.startsWith(ipfsPrefix)) return html`${source}`;

    const cid = source.slice(ipfsPrefix.length);
    const href = `https://assets.dimo.org/ipfs/${cid}`;
    const display = `ipfs://...${cid.slice(-6)}`;
    return html`<a href=${href} target="_blank" rel="noopener" title=${source}>${display}</a>`;
  }

  render() {
    return html`
      <div class="panel">
        <div class="panel-header">${msg('Vehicle Sharing')}</div>
        <div class="panel-body" style="padding: 0;">
          ${this.errorMessage ? html`<div class="alert alert-error" style="margin: 16px;">${this.errorMessage}</div>` : ''}
          <table>
            <thead>
              <tr>
                <th>${msg('Grantee')}</th>
                <th>${msg('Permissions')}</th>
                <th>${msg('Source')}</th>
                <th>${msg('Created At')}</th>
                <th>${msg('Expires At')}</th>
              </tr>
            </thead>
            <tbody>
              ${this.loading ? html`
                <tr>
                  <td colspan="5" style="text-align: center; color: #666; padding: 2rem;">${msg('Loading...')}</td>
                </tr>
              ` : this.sacds.length > 0 ? this.sacds.map(sacd => html`
                <tr>
                  <td>${this.renderGrantee(sacd.grantee)}</td>
                  <td>${sacd.permissions}</td>
                  <td>${this.renderSource(sacd.source)}</td>
                  <td>${sacd.createdAt ? dayjs(sacd.createdAt).format('MMM D, YYYY') : 'N/A'}</td>
                  <td>${sacd.expiresAt ? dayjs(sacd.expiresAt).format('MMM D, YYYY') : 'N/A'}</td>
                </tr>
              `) : html`
                <tr>
                  <td colspan="5" style="text-align: center; color: #666; padding: 2rem;">${msg('Vehicle not shared with any entities. Have user login to mobile app')}</td>
                </tr>
              `}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'vehicle-sharing-panel': VehicleSharingPanel;
  }
}
