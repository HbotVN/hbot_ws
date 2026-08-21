from setuptools import find_packages, setup

package_name = 'hbot_web'

setup(
    name=package_name,
    version='0.0.0',
    packages=find_packages(exclude=['test']),
    package_data={
        package_name: [
            'templates/*.html',
            'static/css/*.css',
            'static/js/*.js',
            'scripts/*.sh',
        ],
    },
    data_files=[
        ('share/ament_index/resource_index/packages',
            ['resource/' + package_name]),
        ('share/' + package_name, ['package.xml']),
    ],
    install_requires=['setuptools'],
    zip_safe=True,
    maintainer='root',
    maintainer_email='huyhust13@gmail.com',
    description='Robot Web Control Dashboard and WiFi Manager',
    license='Apache-2.0',
    tests_require=['pytest'],
    entry_points={
        'console_scripts': [
            'web_node = hbot_web.web_node:main'
        ],
    },
)
