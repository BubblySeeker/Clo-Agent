"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Building2, Bed, Bath, Ruler, MapPin } from "lucide-react";
import { portalProperties, type PortalProperty } from "@/lib/api/portal";

export default function PortalPropertiesPage() {
  const params = useParams();
  const token = params.token as string;

  const [properties, setProperties] = useState<PortalProperty[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    portalProperties(token)
      .then((data) => setProperties(data.properties))
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin w-7 h-7 border-3 border-cyan-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (properties.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
        <Building2 className="w-10 h-10 text-gray-300 mx-auto mb-3" />
        <h2 className="text-lg font-semibold text-gray-900 mb-1">
          No Properties
        </h2>
        <p className="text-sm text-gray-500">
          No properties linked to your deals yet.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {properties.map((prop) => (
        <div
          key={prop.id}
          className="bg-white rounded-xl border border-gray-200 overflow-hidden"
        >
          {/* Photo placeholder */}
          <div className="h-40 bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center">
            <Building2 className="w-10 h-10 text-gray-300" />
          </div>

          <div className="p-5">
            <div className="flex items-start justify-between mb-2">
              <div>
                <h3 className="font-semibold text-gray-900">{prop.address}</h3>
                <p className="text-sm text-gray-500 flex items-center gap-1 mt-0.5">
                  <MapPin className="w-3.5 h-3.5" />
                  {prop.city}, {prop.state} {prop.zip}
                </p>
              </div>
              {prop.price != null && (
                <span className="text-lg font-bold text-gray-800">
                  ${prop.price.toLocaleString()}
                </span>
              )}
            </div>

            <div className="flex items-center gap-4 mt-3 text-sm text-gray-600">
              {prop.bedrooms != null && (
                <span className="flex items-center gap-1">
                  <Bed className="w-4 h-4 text-gray-400" />
                  {prop.bedrooms} bed
                </span>
              )}
              {prop.bathrooms != null && (
                <span className="flex items-center gap-1">
                  <Bath className="w-4 h-4 text-gray-400" />
                  {prop.bathrooms} bath
                </span>
              )}
              {prop.sqft != null && (
                <span className="flex items-center gap-1">
                  <Ruler className="w-4 h-4 text-gray-400" />
                  {prop.sqft.toLocaleString()} sqft
                </span>
              )}
            </div>

            {prop.property_type && (
              <span className="inline-block mt-3 px-2 py-0.5 rounded bg-gray-100 text-xs text-gray-600 capitalize">
                {prop.property_type}
              </span>
            )}

            {prop.status && (
              <span className="inline-block mt-3 ml-2 px-2 py-0.5 rounded bg-cyan-50 text-xs text-cyan-700 capitalize">
                {prop.status}
              </span>
            )}

            {prop.description && (
              <p className="text-sm text-gray-600 mt-3 line-clamp-3">
                {prop.description}
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
