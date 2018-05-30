import json
from pprint import pprint

with open('images_091117/demo_091117_CAM24_camera.json') as data_file:    
    camera = json.load(data_file)
with open('images_091117/demo_091117_CAM24_pano.json') as data_file:    
    pano = json.load(data_file)
# print camera
# print pano

offset= { "x": 657000, "y": 6860000, "z": -0.4 }

geojson = { "type": "FeatureCollection", "features": [], "properties": camera, "crs": {"type": "EPSG","properties": { "code": 2154}}}

for p in pano:
	p['easting']  += offset["x"]
	p['northing'] += offset["y"]
	p['altitude'] += offset["z"]
	f = { "type": "Feature", "geometry": { "type": "Point", "coordinates": [p['easting'], p['northing'], p['altitude']]},"properties": {}}
	f['properties'] = p
	geojson['features'].append(f)

with open('demo_091117_CAM24.geojson', 'w') as outfile:  
    json.dump(geojson, outfile)

# geojson = { "type": "MultiPoint", "coordinates": [], "properties": camera}
# for p in pano:
# 	geojson['coordinates'].append([p['easting'], p['northing']])
# 	# f = { "type": "Feature", "geometry": { "type": "Point", "coordinates": [p['easting'], p['northing']]},"properties": {}}
# 	# f['properties'] = p
# 	# geojson['features'].append(f)

# with open('demo_091117_CAM24.geojson', 'w') as outfile:  
#     json.dump(geojson, outfile)

# geojson = { "type": "GeometryCollection", "geometries": [], "properties": ""}
# for p in pano:
# 	f = { "type": "Point", "coordinates": [p['easting'], p['northing']]}
# 	# f['properties'] = p
# 	geojson['geometries'].append(f)

# with open('demo_091117_CAM24.geojson', 'w') as outfile:  
#     json.dump(geojson, outfile)