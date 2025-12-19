const webpack = require('webpack');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const TerserPlugin = require('terser-webpack-plugin');
const { BundleAnalyzerPlugin } = require('webpack-bundle-analyzer');
const path = require('path');
const PATHS = require('./paths');

// 이미지 파일 타입 정의
const IMAGE_TYPES = /\.(png|jpe?g|gif|svg)$/i;
const SHOULD_ANALYZE = process.env.ANALYZE === '1';

module.exports = {
  // 번들 파일 출력 경로와 이름 정의
  output: {
    path: PATHS.build,
    filename: 'js/[name].js',
    clean: true,
  },
  stats: {
    all: false,
    errors: true,
    builtAt: true,
    assets: true,
    excludeAssets: [IMAGE_TYPES], // 이미지 파일 제외
  },
  module: {
    rules: [
      // CSS 파일 처리
      {
        test: /\.css$/,
        use: [MiniCssExtractPlugin.loader, 'css-loader'],
      },
      // 이미지 파일 처리
      {
        test: IMAGE_TYPES,
        type: 'asset/resource',
        generator: {
          filename: 'assets/images/[name][ext]',
        },
      },
    ],
  },
  optimization: {
    minimize: true,
    minimizer: [
      new TerserPlugin({
        terserOptions: {
          compress: {
            drop_console: true, // 로그 제거
          },
          sourceMap: true,
          toplevel: true,
          mangle: true,
        },
        extractComments: false, // 주석 제거
      }),
    ],
  },
  plugins: [
    new CopyWebpackPlugin({
      patterns: [
        {
          from: '.',
          globOptions: {
            ignore: [
              '**/*.js',
              '**/manifest.json',
            ],
          },
          context: 'llm-translator-chrome-extention',
          to: '.',
        },
        {
          from: 'manifest.json',
          context: 'llm-translator-chrome-extention',
          to: '.',
        },
      ],
    }),
    new MiniCssExtractPlugin({
      filename: 'css/[name].css',
    }),

    SHOULD_ANALYZE &&
      new BundleAnalyzerPlugin({
        analyzerMode: 'server',
        analyzerHost: '127.0.0.1',
        analyzerPort: 8888,
        openAnalyzer: true,
      }),
  ].filter(Boolean),
};
